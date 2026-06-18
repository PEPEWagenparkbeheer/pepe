// src/lib/leads/verwerk.ts
// Gedeelde verwerking van een inkomende (lead/tender) mail. Gebruikt door zowel de
// Postmark-webhook (/api/leads-inbound) als de automatische info@-intake (intake.ts).
// Tender-detectie blijft op Groq (tender-parser); lead-extractie draait op Claude Haiku.
// Server-only.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isLeaseAanvraag, parseLeaseAanvraagMail } from '@/lib/tender-parser';
import { extractJson } from '@/lib/llm/extractJson';

export interface LeadMailInput {
  from: string;            // ruwe From-waarde (bv. '"Naam" <mail@x.nl>')
  fromName?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  /**
   * True wanneer de afzender niet de koper is maar een provider/doorstuuradres
   * (doorgestuurde mail of rechtstreeks uit info@): dan altijd via de LLM-extractie.
   */
  altijdExtraheren: boolean;
}

export type LeadMailResultaat =
  | { routed: 'tender'; id?: string }
  | { routed: 'lead' }
  | { routed: 'skipped'; reden: string };

interface LeadExtract {
  geen_lead?: boolean;
  klant_naam?: string;
  email?: string | null;
  telefoon?: string | null;
  auto?: string;
  prijs?: string | null;
  bron?: string;
  advertentie_url?: string | null;
  bericht?: string;
}

const GELDIGE_BRON = ['autoscout24', 'marktplaats', 'autowereld', 'email'];

const LEAD_SYSTEM_PROMPT =
  'Je extraheert lead-informatie uit (doorgestuurde) e-mails voor autohandelaar PEPE Wagenparkbeheer. Retourneer ALLEEN JSON met: klant_naam (naam potentiële koper, NIET van PEPE of een collega), email (e-mail koper of null), telefoon (tel koper of null), auto (alleen merk en model, bijv. "MINI Countryman" of "Volkswagen Golf" — geen prijs, km-stand, jaar of opties), prijs (vraagprijs als string bijv. "€ 28.340,-" of null), bron (autoscout24|marktplaats|autowereld|email), advertentie_url (volledige URL naar de advertentie op autoscout24/marktplaats/autowereld/mobile.de of null), bericht (alleen de daadwerkelijke klantvraag, geen signatures, forwarding-headers of contactblokken). Bij geen echte lead (factuur/spam/auto-reply): {"geen_lead":true}.';

// Probeert een advertentielink te vinden uit HTML + tekst van de e-mail.
function extractAdUrl(html: string, text: string): string | null {
  const combined = html + ' ' + text;

  const hrefMatch = html.match(
    /href=["']([^"']*(?:autoscout24\.[a-z]{1,6}|autowereld\.[a-z]{1,6}|marktplaats\.nl|mobile\.de|autotrack\.nl)[^"']*)["']/i,
  );
  if (hrefMatch) return hrefMatch[1].replace(/&amp;/g, '&');

  const urlMatch = combined.match(
    /https?:\/\/(?:www\.)?(?:autoscout24\.[a-z]+\/[^\s<>"&]+|autowereld\.[a-z]+\/[^\s<>"&]+|marktplaats\.nl\/[^\s<>"&]+|mobile\.de\/[^\s<>"&]+|autotrack\.nl\/[^\s<>"&]+)/i,
  );
  if (urlMatch) return urlMatch[0].replace(/[,.)]+$/, '');

  const mobileNr = combined.match(/(?:Ad number|Inserat)[:\s#]+(\d{6,})/i);
  if (mobileNr) return `https://www.mobile.de/auto-inserat/id/${mobileNr[1]}`;

  const mpNr = combined.match(/Advertentienr[.:\s]+(\d{5,})/i);
  if (mpNr) return `https://www.marktplaats.nl/v/a${mpNr[1]}.html`;

  return null;
}

/** Lead-extractie via Claude Haiku. Retourneert het geparste object of null. */
async function leadExtract(subject: string, body: string): Promise<LeadExtract | null> {
  return extractJson<LeadExtract>(LEAD_SYSTEM_PROMPT, `Onderwerp: ${subject}\n\n${body}`);
}

/** Verwerkt één mail: tender → tenders, lead → leads, anders skipped. */
export async function verwerkLeadMail(input: LeadMailInput): Promise<LeadMailResultaat> {
  const { from, subject, textBody, htmlBody, altijdExtraheren } = input;
  const fromLow = from.toLowerCase();

  // ── TENDER ROUTE (ongewijzigd, blijft op Groq) ──
  if (isLeaseAanvraag(subject, textBody)) {
    const rawEmail = `Van: ${from}\nOnderwerp: ${subject}\n\n${textBody || htmlBody}`;
    const result = await parseLeaseAanvraagMail(`Onderwerp: ${subject}\n\n${textBody}`);
    if (result.geen_aanvraag) return { routed: 'skipped', reden: 'geen_aanvraag' };

    const fromNameMatch = from.match(/^"?([^"<]+?)"?\s*<.*>$/)?.[1]?.trim();
    const fromEmail =
      from.match(/<([^>]+)>/)?.[1]?.trim() ??
      from.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/)?.[1]?.trim();
    const { data, error } = await supabaseAdmin
      .from('tenders')
      .insert({
        klant_naam: result.parsed?.naam || fromNameMatch || 'Onbekend',
        klant_email: result.parsed?.email || fromEmail || null,
        raw_email: rawEmail,
        parsed_data: result.parsed ?? null,
        leasenorm: result.parsed?.leasenorm ?? null,
        status: result.error ? 'failed' : 'pending',
      })
      .select('id')
      .single();
    if (error) throw new Error(`tender insert mislukt: ${error.message}`);
    return { routed: 'tender', id: data.id as string };
  }

  // ── LEAD ROUTE ──
  let klant_naam: string;
  let email: string | null;
  let telefoon: string | null;
  let auto: string;
  let bron: string;
  let bericht: string;
  let advertentie_url: string | null = null;
  let prijs: string | null = null;

  if (altijdExtraheren) {
    // AutoScout24 oproepmelding: bevat alleen een telefoonnummer.
    const isOproep = /(?:aangenomen|gemiste)\s+oproep/i.test(subject);
    if (isOproep) {
      const combinedBody = textBody + ' ' + htmlBody;
      const telMatch =
        combinedBody.match(/(?:Telefoonnummer|Telefoon|Tel\.?)[:\s]+(\+?[\d][\d\s\-]{6,})/i) ||
        combinedBody.match(/(\+31[\d\s\-]{8,}|06[\d\s\-]{8,})/);
      telefoon = telMatch ? telMatch[1].replace(/\s+/g, '').trim() : null;
      klant_naam = telefoon || 'Onbekend';
      email = null;
      const autoMatch = subject.match(/voor\s+(.+?)(?:\s*[€,]|$)/i);
      auto = autoMatch
        ? autoMatch[1].trim()
        : subject.replace(/^fwd?:\s*/i, '').replace(/autoscout24[^:]*:\s*/i, '');
      bron = 'autoscout24';
      bericht = `Oproep via AutoScout24`;
    } else {
      const ext = await leadExtract(subject, textBody);
      if (ext?.geen_lead) return { routed: 'skipped', reden: 'geen_lead' };

      if (ext) {
        klant_naam = ext.klant_naam || 'Onbekend';
        email = ext.email || null;
        telefoon = ext.telefoon || null;
        auto = ext.auto || subject.replace(/^fwd?:\s*/i, '');
        bron = ext.bron && GELDIGE_BRON.includes(ext.bron) ? ext.bron : 'email';
        bericht = ext.bericht || textBody;
        advertentie_url = extractAdUrl(htmlBody, textBody) || ext.advertentie_url || null;
        prijs = ext.prijs || null;
      } else {
        klant_naam = 'Onbekend';
        email = null;
        telefoon = null;
        auto = subject.replace(/^fwd?:\s*/i, '');
        bron = 'email';
        bericht = textBody;
      }
    }
  } else {
    klant_naam = input.fromName || from.split('@')[0] || 'Onbekend';
    email = from || null;
    const telMatch = textBody.match(/(\+31|06|0\d{1,3})[\s-]?\d[\d\s-]{6,}/);
    telefoon = telMatch ? telMatch[0].trim() : null;
    auto = subject;
    bron = fromLow.includes('autoscout')
      ? 'autoscout24'
      : fromLow.includes('autowereld')
        ? 'autowereld'
        : fromLow.includes('marktplaats')
          ? 'marktplaats'
          : 'email';
    bericht = textBody;
    advertentie_url = extractAdUrl(htmlBody, textBody);
  }

  const { error } = await supabaseAdmin.from('leads').insert({
    klant_naam,
    email,
    telefoon,
    auto,
    prijs,
    bericht,
    bron,
    advertentie_url,
    status: 'nieuw',
    gearchiveerd: false,
  });
  if (error) throw new Error(`leads insert mislukt: ${error.message}`);

  return { routed: 'lead' };
}
