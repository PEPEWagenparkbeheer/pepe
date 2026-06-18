// POST /api/leads-inbound
// Postmark inbound webhook voor leads/tenders. De verwerking zelf zit in de
// gedeelde module src/lib/leads/verwerk.ts (ook gebruikt door de automatische
// info@-intake). Deze route mapt alleen de Postmark-payload op die functie.

import { NextRequest, NextResponse } from 'next/server';
import { webhookSecretOk } from '@/lib/apiAuth';
import { verwerkLeadMail } from '@/lib/leads/verwerk';

export async function POST(req: NextRequest) {
  if (!webhookSecretOk(req, process.env.LEADS_WEBHOOK_SECRET))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const from: string = body.From || '';
  const subject: string = body.Subject || '';
  const textBody: string = body.StrippedTextReply || body.TextBody || '';
  const htmlBody: string = body.HtmlBody || '';

  // Doorgestuurde mail (vanuit info@ of "Fwd:") → afzender is niet de koper,
  // dus altijd via LLM-extractie. Anders is de afzender zelf de lead.
  const altijdExtraheren =
    from.toLowerCase().includes('info@pepewagen') || /^fwd?:\s/i.test(subject);

  try {
    const result = await verwerkLeadMail({
      from,
      fromName: body.FromName ?? null,
      subject,
      textBody,
      htmlBody,
      altijdExtraheren,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('leads-inbound fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
