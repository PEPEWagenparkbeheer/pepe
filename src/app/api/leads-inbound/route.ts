import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { webhookSecretOk } from '@/lib/apiAuth';
import { isLeaseAanvraag, parseLeaseAanvraagMail } from '@/lib/tender-parser';

// Probeert een advertentielink te vinden uit HTML + tekst van de e-mail.
// Volgorde: href in HTML → plain URL in tekst → advertentienummer opbouwen.
function extractAdUrl(html: string, text: string): string | null {
  const combined = html + ' ' + text;

  // 1. href-attributen uit HTML (knoppen zoals "Naar de advertentie")
  const hrefMatch = html.match(
    /href=["']([^"']*(?:autoscout24\.[a-z]{1,6}|autowereld\.[a-z]{1,6}|marktplaats\.nl|mobile\.de|autotrack\.nl)[^"']*)["']/i,
  );
  if (hrefMatch) return hrefMatch[1].replace(/&amp;/g, '&');

  // 2. Volledige URL in platte tekst
  const urlMatch = combined.match(
    /https?:\/\/(?:www\.)?(?:autoscout24\.[a-z]+\/[^\s<>"&]+|autowereld\.[a-z]+\/[^\s<>"&]+|marktplaats\.nl\/[^\s<>"&]+|mobile\.de\/[^\s<>"&]+|autotrack\.nl\/[^\s<>"&]+)/i,
  );
  if (urlMatch) return urlMatch[0].replace(/[,.)]+$/, '');

  // 3. Mobile.de "Ad number: 445530743" → URL opbouwen
  const mobileNr = combined.match(/(?:Ad number|Inserat)[:\s#]+(\d{6,})/i);
  if (mobileNr) return `https://www.mobile.de/auto-inserat/id/${mobileNr[1]}`;

  // 4. "Advertentienr. 4326756" zonder href → marktplaats URL opbouwen
  const mpNr = combined.match(/Advertentienr[.:\s]+(\d{5,})/i);
  if (mpNr) return `https://www.marktplaats.nl/v/a${mpNr[1]}.html`;

  return null;
}

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
  if (!webhookSecretOk(req, process.env.LEADS_WEBHOOK_SECRET))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const fromRaw: string = body.From || '';
  const fromLow = fromRaw.toLowerCase();
  const subject: string = body.Subject || '';
  const textBody: string = body.StrippedTextReply || body.TextBody || '';
  const htmlBody: string = body.HtmlBody || '';

  // ── TENDER ROUTE ──
  // Eerst kijken of het een lease-aanvraag is. Zo ja, doorgeven aan de
  // tender-handler en hier stoppen — geen lead aanmaken.
  if (isLeaseAanvraag(subject, textBody)) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const rawEmail = `Van: ${fromRaw}\nOnderwerp: ${subject}\n\n${textBody || htmlBody}`;
    const result = await parseLeaseAanvraagMail(`Onderwerp: ${subject}\n\n${textBody}`);
    if (result.geen_aanvraag) {
      return NextResponse.json({ ok: true, routed: 'tender', skipped: 'geen_aanvraag' });
    }
    const fromName = fromRaw.match(/^"?([^"<]+?)"?\s*<.*>$/)?.[1]?.trim();
    const fromEmail = fromRaw.match(/<([^>]+)>/)?.[1]?.trim()
                      ?? fromRaw.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/)?.[1]?.trim();
    const { data, error } = await supabaseAdmin
      .from('tenders')
      .insert({
        klant_naam: result.parsed?.naam || fromName || 'Onbekend',
        klant_email: result.parsed?.email || fromEmail || null,
        raw_email: rawEmail,
        parsed_data: result.parsed ?? null,
        leasenorm: result.parsed?.leasenorm ?? null,
        status: result.error ? 'failed' : 'pending',
      })
      .select('id')
      .single();
    if (error) {
      console.error('tender insert fout:', error);
      return NextResponse.json({ error: 'DB insert mislukt' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, routed: 'tender', tender_id: data.id });
  }

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
    // AutoScout24 oproepmelding: "Aangenomen oproep" / "Gemiste oproep"
    // Bevat geen klantnaam/bericht, alleen telefoonnummer — Groq zou dit als geen_lead markeren.
    const isOproep = /(?:aangenomen|gemiste)\s+oproep/i.test(subject);
    if (isOproep) {
      const combinedBody = textBody + ' ' + htmlBody;
      const telMatch = combinedBody.match(/(?:Telefoonnummer|Telefoon|Tel\.?)[:\s]+(\+?[\d][\d\s\-]{6,})/i)
                    || combinedBody.match(/(\+31[\d\s\-]{8,}|06[\d\s\-]{8,})/);
      telefoon   = telMatch ? telMatch[1].replace(/\s+/g, '').trim() : null;
      klant_naam = telefoon || 'Onbekend';
      email      = null;
      const autoMatch = subject.match(/voor\s+(.+?)(?:\s*[€,]|$)/i);
      auto       = autoMatch ? autoMatch[1].trim() : subject.replace(/^fwd?:\s*/i, '').replace(/autoscout24[^:]*:\s*/i, '');
      bron       = 'autoscout24';
      bericht    = `Oproep via AutoScout24`;
      prijs      = null;
    } else {
      const ext = await groqExtract(subject, textBody);
      if (ext?.geen_lead) return NextResponse.json({ ok: true, skipped: 'geen_lead' });

      if (ext) {
        klant_naam     = ext.klant_naam     || 'Onbekend';
        email          = ext.email          || null;
        telefoon       = ext.telefoon       || null;
        auto           = ext.auto           || subject.replace(/^fwd?:\s*/i, '');
        bron           = GELDIGE_BRON.includes(ext.bron) ? ext.bron : 'email';
        bericht        = ext.bericht        || textBody;
        advertentie_url = extractAdUrl(htmlBody, textBody) || ext.advertentie_url || null;
        prijs          = ext.prijs          || null;
      } else {
        klant_naam = 'Onbekend';
        email      = null;
        telefoon   = null;
        auto       = subject.replace(/^fwd?:\s*/i, '');
        bron       = 'email';
        bericht    = textBody;
      }
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
    advertentie_url = extractAdUrl(htmlBody, textBody);
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
