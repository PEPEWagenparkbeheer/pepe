import { NextRequest, NextResponse } from 'next/server';
import { parseLeaseAanvraagMail } from '@/lib/tender-parser';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const emailText: string = body.email ?? '';

  if (!emailText || emailText.length < 10) {
    return NextResponse.json({ error: 'email-veld ontbreekt of te kort' }, { status: 400 });
  }

  const result = await parseLeaseAanvraagMail(emailText);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  if (result.geen_aanvraag) {
    return NextResponse.json({ geen_aanvraag: true });
  }
  return NextResponse.json({ parsed: result.parsed });
}
