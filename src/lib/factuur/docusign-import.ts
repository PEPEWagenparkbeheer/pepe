// Importeert een getekende DocuSign-offerte (verkoop import-auto) als auto-verkoopfactuur
// in status 'aanvullen'. De offerte heeft (meestal) GEEN kenteken — dat + BPM + chassis vult
// PEPE later aan zodra de auto is ingekocht. Daarna "Akkoord & verstuur".
//
// Bron-data: ondertekenaar (klant) uit DocuSign-recipients; voertuig/prijs uit de PDF-tekst.

import { extractText, getDocumentProxy } from 'unpdf';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEnvelopeRecipients, getEnvelopeCombinedPdf } from '@/lib/consignatie-docusign';
import { searchCompanyByName, getCompanyFields } from '@/lib/hubspot';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel } from '@/types/factuur';

function nlGetal(s?: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function match(re: RegExp, tekst: string): string | undefined {
  return tekst.match(re)?.[1]?.trim();
}

export interface ImportResult {
  ok: boolean;
  id?: string;
  bestond?: boolean;
  genegeerd?: boolean;
  error?: string;
}

/** Haalt envelope op, parseert en maakt (idempotent) een auto-order in status 'aanvullen'. */
export async function importeerAutoUitEnvelope(envelopeId: string): Promise<ImportResult> {
  const env = String(envelopeId ?? '').trim();
  if (!env) return { ok: false, error: 'envelopeId vereist' };

  // Idempotent: al geïmporteerd?
  const { data: bestaat } = await supabaseAdmin
    .from('uitgaande_facturen').select('id').eq('docusign_envelope_id', env).maybeSingle();
  if (bestaat) return { ok: true, id: bestaat.id, bestond: true };

  // Klant uit ondertekenaars (eerste signer)
  let klantNaam = '';
  let klantEmail = '';
  try {
    const recs = await getEnvelopeRecipients(env);
    const eerste = recs.sort((a, b) => Number(a.routingOrder ?? 0) - Number(b.routingOrder ?? 0))[0];
    if (eerste) { klantNaam = eerste.name; klantEmail = eerste.email; }
  } catch { /* niet fataal */ }

  // Voertuig/prijs uit de getekende PDF
  let tekst = '';
  try {
    const pdf = await getDocumentProxy(await getEnvelopeCombinedPdf(env));
    const res = await extractText(pdf, { mergePages: true });
    tekst = Array.isArray(res.text) ? res.text.join(' ') : res.text;
  } catch (e) {
    return { ok: false, error: `PDF lezen mislukt: ${String(e)}` };
  }
  tekst = tekst.replace(/\s+/g, ' ');

  // Veiligheidsfilter: alleen ECHTE verkoop-offertes verwerken. Een Connect-webhook vuurt bij
  // élke voltooide envelope (ook consignatie-inkoopverklaringen) — die mogen geen auto-order worden.
  const isVerkoopOfferte = /Basisgegevens/i.test(tekst) && /Toe te betalen/i.test(tekst);
  const isInkoopverklaring = /inkoopverklaring|margeregeling verklaar/i.test(tekst);
  if (!isVerkoopOfferte || isInkoopverklaring) {
    return { ok: true, genegeerd: true, error: 'Geen verkoop-offerte — genegeerd.' };
  }

  const titel = match(/Datum:\s*\d{2}-\d{2}-\d{4}\s+(.+?)\s+Basisgegevens/i, tekst) ?? '';
  const [merk, ...rest] = titel.split(' ');
  const model = rest.join(' ');
  const kleur = match(/(?:^|[^e])\bKleur\s+([A-Za-z\-]+)/i, tekst);
  const kmStand = nlGetal(match(/Kilometerstand\s+([\d.,]+)/i, tekst));
  const bouwjaar = match(/Bouwjaar\s+(\d{2}\/\d{4})/i, tekst);
  const autoNetto = nlGetal(match(/Totaal\s*€\s*([\d.,]+)/i, tekst));        // subtotaal auto excl. btw/bpm
  const btwBedrag = nlGetal(match(/(?:\s)BTW\s*€\s*([\d.,]+)/i, tekst));      // alleen met €-teken (niet footer "BTW:")
  const bpmBedrag = nlGetal(match(/(?:\s)BPM\s*€\s*([\d.,]+)/i, tekst));
  const toeTeBetalen = nlGetal(match(/Toe te betalen\s*€?\s*([\d.,]+)/i, tekst));
  const bedrijfsinvestering = nlGetal(match(/Bedrijfsinvestering\s*€?\s*([\d.,]+)/i, tekst));
  const tav = klantNaam || match(/T\.a\.v\.\s+(.+?)\s+Verkoper:/i, tekst) || '';

  // BTW-auto vs marge-auto. BTW-auto als: er een BTW-bedrag staat, OF de bedrijfsinvestering
  // afwijkt van het toe-te-betalen bedrag (dan zit er btw/marge in → standaard met btw factureren,
  // ook bij privéverkoop). Anders marge.
  const investeringWijkt = bedrijfsinvestering != null && toeTeBetalen != null
    && Math.abs(bedrijfsinvestering - toeTeBetalen) > 0.5;
  const isBtwAuto = (btwBedrag ?? 0) > 0 || investeringWijkt;
  const bpm = bpmBedrag ?? 0;

  // Optionele HubSpot-NAW van de klant
  let companyId: string | null = null;
  let adres: string | null = null, postcode: string | null = null, plaats: string | null = null;
  if (klantNaam) {
    try {
      const id = await searchCompanyByName(klantNaam);
      if (id) {
        companyId = id;
        const f = await getCompanyFields(id, ['address', 'zip', 'city']);
        adres = (f?.address as string) ?? null;
        postcode = (f?.zip as string) ?? null;
        plaats = (f?.city as string) ?? null;
      }
    } catch { /* niet fataal */ }
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const leverNaam = `Levering ${merk} ${model}`.trim();
  let regels: FactuurRegel[];
  if (isBtwAuto) {
    // Voertuigprijs excl. btw:
    //  - met expliciete BTW-regel → "Totaal €" is al de netto-subtotaal
    //  - anders (btw zit in toe te betalen) → afleiden: (toe te betalen − BPM) / 1,21
    const heeftExplicieteBtw = (btwBedrag ?? 0) > 0 && autoNetto != null;
    const netto = heeftExplicieteBtw
      ? (autoNetto as number)
      : (toeTeBetalen != null ? round2((toeTeBetalen - bpm) / 1.21) : (autoNetto ?? 0));
    regels = [{ omschrijving: leverNaam, aantal: 1, prijs_excl: round2(netto), btw_code: 'hoog' }];
    if (bpm > 0) regels.push({ omschrijving: 'BPM', aantal: 1, prijs_excl: bpm, btw_code: 'geen' });
  } else {
    regels = [{ omschrijving: leverNaam, aantal: 1, prijs_excl: toeTeBetalen ?? 0, btw_code: 'marge' }];
  }
  const totalen = berekenTotalen(regels);

  const notitie = [
    `Geïmporteerd uit DocuSign (${env}).`,
    isBtwAuto ? 'BTW-auto met BPM.' : 'Marge-auto.',
    toeTeBetalen != null ? `Toe te betalen: € ${toeTeBetalen.toFixed(2)} (blijft vast).` : '',
    bedrijfsinvestering != null ? `Bedrijfsinvestering: € ${bedrijfsinvestering.toFixed(2)}.` : '',
    'Geparkeerd in de pijplijn — kenteken, chassis en definitieve rest-BPM stromen automatisch in vanuit after-sales; materialiseert bij rijklaar-melding.',
  ].filter(Boolean).join(' ');

  const { data, error } = await supabaseAdmin.from('uitgaande_facturen').insert({
    type: 'auto',
    soort: 'factuur',
    status: 'pijplijn',
    bron: 'docusign',
    docusign_envelope_id: env,
    hubspot_company_id: companyId,
    klant_naam: klantNaam || null,
    tav: tav || null,
    adres, postcode, plaats,
    email: klantEmail || null,
    betaaltermijn_dagen: 0, // auto: betalen vóór levering
    regels,
    totaal_excl: totalen.totaal_excl,
    totaal_btw: totalen.totaal_btw,
    totaal_incl: totalen.totaal_incl,
    voertuig: {
      merk: merk || null,
      model: model || null,
      kleur: kleur || null,
      km_stand: kmStand,
      datum_deel1a: bouwjaar || null,
      btw_soort: isBtwAuto ? 'btw' : 'marge',
      rest_bpm: isBtwAuto ? bpm : null,
      toe_te_betalen: toeTeBetalen ?? null,
    },
    notitie,
  }).select('id').single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
