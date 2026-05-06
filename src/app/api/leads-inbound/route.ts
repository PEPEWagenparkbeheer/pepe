import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.LEADS_WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const klant_naam = body.FromName || body.From?.split('@')[0] || 'Onbekend';
  const email = body.From || null;
  const auto = body.Subject || '';
  const bericht = body.StrippedTextReply || body.TextBody || '';

  const telMatch = (bericht as string).match(/(\+31|06|0\d{1,3})[\s\-]?\d[\d\s\-]{6,}/);
  const telefoon = telMatch ? telMatch[0].trim() : null;

  // Zoek advertentielink in body (AutoScout24, Autowereld, Marktplaats)
  const urlMatch = (bericht as string).match(
    /https?:\/\/(?:www\.)?(?:autoscout24\.[a-z]+\/[^\s<>"]+|autowereld\.[a-z]+\/[^\s<>"]+|marktplaats\.nl\/[^\s<>"]+|mobile\.de\/[^\s<>"]+)/i,
  );
  const advertentie_url = urlMatch ? urlMatch[0].replace(/[,.)]+$/, '') : null;

  const van = ((body.From as string) || '').toLowerCase();
  const bron = van.includes('autoscout') ? 'autoscout24'
    : van.includes('autowereld') ? 'autowereld'
    : van.includes('marktplaats') ? 'marktplaats'
    : 'email';

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin.from('leads').insert({
    klant_naam, email, telefoon, auto, bericht, bron, advertentie_url,
    status: 'nieuw',
    gearchiveerd: false,
  });

  if (error) {
    console.error('leads-inbound insert fout:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
