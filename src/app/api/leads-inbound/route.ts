import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

async function groqExtract(subject: string, body: string) {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'Je extraheert lead-informatie uit (doorgestuurde) e-mails voor autohandelaar PEPE Wagenparkbeheer. Retourneer ALLEEN JSON met: klant_naam (naam potentiële koper, NIET van PEPE of een collega), email (e-mail koper of null), telefoon (tel koper of null), auto (alleen merk en model, bijv. "MINI Countryman" of "Volkswagen Golf" — geen prijs, km-stand, jaar of opties), prijs (vraagprijs als string bijv. "€ 28.340,-" of null), bron (autoscout24|marktplaats|autowereld|email), advertentie_url (volledige URL naar de advertentie op autoscout24/marktplaats/autowereld/mobile.de of null), bericht (alleen de daadwerkelijke klantvraag, geen signatures, forwarding-headers of contactblokken). Bij geen echte lead (factuur/spam/auto-reply): {"geen_lead":true}.',
          },
          { role: 'user', content: `Onderwerp: ${subject}\n\n${body}` },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const GELDIGE_BRON = ['autoscout24', 'marktplaats', 'autowereld', 'email'];

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.LEADS_WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const fromRaw: string = body.From || '';
  const fromLow = fromRaw.toLowerCase();
  const subject: string = body.Subject || '';
  const textBody: string = body.StrippedTextReply || body.TextBody || '';

  const isForwarded =
    fromLow.includes('info@pepewagen') ||
    /^fwd?:\s/i.test(subject);

  let klant_naam: string;
  let email: string | null;
  let telefoon: string | null;
  let auto: string;
  let bron: string;
  let bericht: string;
  let advertentie_url: string | null = null;
  let prijs: string | null = null;

  if (isForwarded) {
    const ext = await groqExtract(subject, textBody);
    if (ext?.geen_lead) return NextResponse.json({ ok: true, skipped: 'geen_lead' });

    if (ext) {
      klant_naam     = ext.klant_naam     || 'Onbekend';
      email          = ext.email          || null;
      telefoon       = ext.telefoon       || null;
      auto           = ext.auto           || subject.replace(/^fwd?:\s*/i, '');
      bron           = GELDIGE_BRON.includes(ext.bron) ? ext.bron : 'email';
      bericht        = ext.bericht        || textBody;
      advertentie_url = ext.advertentie_url || null;
      prijs          = ext.prijs          || null;
    } else {
      klant_naam = 'Onbekend';
      email      = null;
      telefoon   = null;
      auto       = subject.replace(/^fwd?:\s*/i, '');
      bron       = 'email';
      bericht    = textBody;
    }
  } else {
    klant_naam = body.FromName || fromRaw.split('@')[0] || 'Onbekend';
    email      = fromRaw || null;
    const telMatch = textBody.match(/(\+31|06|0\d{1,3})[\s-]?\d[\d\s-]{6,}/);
    telefoon   = telMatch ? telMatch[0].trim() : null;
    auto       = subject;
    bron       = fromLow.includes('autoscout') ? 'autoscout24'
               : fromLow.includes('autowereld') ? 'autowereld'
               : fromLow.includes('marktplaats') ? 'marktplaats'
               : 'email';
    bericht    = textBody;
    const urlMatch = textBody.match(
      /https?:\/\/(?:www\.)?(?:autoscout24\.[a-z]+\/[^\s<>"]+|autowereld\.[a-z]+\/[^\s<>"]+|marktplaats\.nl\/[^\s<>"]+|mobile\.de\/[^\s<>"]+)/i,
    );
    advertentie_url = urlMatch ? urlMatch[0].replace(/[,.)]+$/, '') : null;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin.from('leads').insert({
    klant_naam, email, telefoon, auto, prijs, bericht, bron, advertentie_url,
    status: 'nieuw',
    gearchiveerd: false,
  });

  if (error) {
    console.error('leads-inbound insert fout:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
