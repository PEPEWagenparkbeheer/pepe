import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseLeaseAanvraagMail } from '@/lib/tender-parser';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  // Secret check via query param (zelfde patroon als leads-inbound)
  if (req.nextUrl.searchParams.get('secret') !== process.env.TENDER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const from: string = body.From || '';
  const subject: string = body.Subject || '';
  const textBody: string = body.StrippedTextReply || body.TextBody || '';
  const htmlBody: string = body.HtmlBody || '';

  // Volledige raw mail bewaren (voor debug / re-parse)
  const rawEmail = `Van: ${from}\nOnderwerp: ${subject}\n\n${textBody || htmlBody}`;

  // Combineer subject + body voor Groq context
  const emailText = `Onderwerp: ${subject}\n\n${textBody}`;

  const result = await parseLeaseAanvraagMail(emailText);

  if (result.geen_aanvraag) {
    // Skip — geen tender-aanvraag
    return NextResponse.json({ ok: true, skipped: 'geen_aanvraag' });
  }

  // Sla altijd op, ook als parsen mislukt — adviseur kan dan handmatig invullen
  const klantNaam = result.parsed?.naam || extractFromName(from) || 'Onbekend';
  const klantEmail = result.parsed?.email || extractFromEmail(from) || null;

  const { data, error } = await supabaseAdmin
    .from('tenders')
    .insert({
      klant_naam: klantNaam,
      klant_email: klantEmail,
      raw_email: rawEmail,
      parsed_data: result.parsed ?? null,
      leasenorm: result.parsed?.leasenorm ?? null,
      status: result.error ? 'failed' : 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('tender insert fout:', error);
    return NextResponse.json({ error: 'DB insert mislukt: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tender_id: data.id, parse_error: result.error });
}

function extractFromName(from: string): string | null {
  // "Jan Jansen <jan@example.com>" → "Jan Jansen"
  const m = from.match(/^"?([^"<]+?)"?\s*<.*>$/);
  return m ? m[1].trim() : null;
}
function extractFromEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/) || from.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  return m ? m[1].trim() : null;
}
