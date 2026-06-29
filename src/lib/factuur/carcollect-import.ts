// Maakt van een CarCollect "Facturatieverzoek"-mail (afzender noreply@carcollect.com) een
// auto-verkoopfactuur in status 'concept'. Anders dan de DocuSign-import bevat deze mail ál het
// nodige (kenteken, VIN, km, koper-NAW én de complete prijsopbouw) — dus geen 'aanvullen', maar
// direct een compleet concept dat PEPE alleen nog hoeft goed te keuren en te versturen.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { berekenTotalen } from '@/lib/factuur/btw';
import { searchDebiteurCandidates } from '@/lib/twinfield/factuur';
import { parseCarCollectMail, type CarCollectData } from '@/lib/factuur/carcollect-parse';
import type { GraphMessage } from '@/lib/graph/mail';
import type { FactuurRegel } from '@/types/factuur';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CarCollectImportResult {
  ok: boolean;
  id?: string;
  bestond?: boolean;
  genegeerd?: boolean;
  kenteken?: string | null;
  klant?: string | null;
  error?: string;
}

/** Bouwt de factuurregels uit de geparste CarCollect-data. */
export function bouwRegels(d: CarCollectData): FactuurRegel[] {
  const regels: FactuurRegel[] = [];
  const merkModel = [d.merk, d.model].filter(Boolean).join(' ').trim();
  const kent = d.kenteken ? ` (${d.kenteken})` : '';
  const netto = d.netto_excl ?? 0;
  regels.push({
    omschrijving: `Levering ${merkModel}${kent}`.trim(),
    aantal: 1,
    prijs_excl: round2(netto),
    btw_code: d.btw_soort === 'btw' ? 'hoog' : 'marge',
  });
  if ((d.rest_bpm ?? 0) > 0) {
    regels.push({ omschrijving: 'Rest-BPM', aantal: 1, prijs_excl: round2(d.rest_bpm as number), btw_code: 'geen' });
  }
  if ((d.admin_kosten ?? 0) > 0) {
    regels.push({ omschrijving: 'Administratiekosten', aantal: 1, prijs_excl: round2(d.admin_kosten as number), btw_code: 'hoog' });
  }
  for (const ek of d.extra_kosten ?? []) {
    if (!ek || !ek.bedrag_excl) continue;
    regels.push({ omschrijving: ek.omschrijving || 'Extra kosten', aantal: 1, prijs_excl: round2(ek.bedrag_excl), btw_code: ek.btw === 'geen' ? 'geen' : 'hoog' });
  }
  return regels;
}

/** Verwerkt één CarCollect-mail (idempotent op bron_ref = message-id). */
export async function importeerCarCollectMail(msg: GraphMessage): Promise<CarCollectImportResult> {
  const ref = `carcollect:${msg.id}`;

  // Idempotent: deze mail al verwerkt?
  const { data: bestaat } = await supabaseAdmin
    .from('uitgaande_facturen').select('id, kenteken').eq('bron_ref', ref).maybeSingle();
  if (bestaat) return { ok: true, id: bestaat.id, bestond: true };

  // Veiligheidsfilter: alleen echte facturatieverzoeken.
  if (!/facturatieverzoek/i.test(msg.subject) || !/carcollect\.com/i.test(msg.afzenderEmail)) {
    return { ok: true, genegeerd: true, error: 'Geen CarCollect-facturatieverzoek.' };
  }

  const d = await parseCarCollectMail(msg.bodyHtml || msg.bodyPreview, !!msg.bodyHtml);
  if (!d) return { ok: false, error: 'Mail kon niet worden geparseerd.' };
  if (!d.kenteken && !d.koper?.bedrijf) {
    return { ok: false, error: 'Onvoldoende gegevens uit de mail (geen kenteken/bedrijf).' };
  }

  const regels = bouwRegels(d);
  const totalen = berekenTotalen(regels);

  // Debiteur: TWINFIELD-FIRST. Veel handelaren staan al in Twinfield → match op naam én
  // postcode/huisnummer. Geen HubSpot-lookup/-creatie hier: handel-auto's hoeven niet in HubSpot
  // (geen deal, niet op rijdend = geen vervuiling). Het eventuele aanmaken van de debiteur + het
  // heen-en-weer schrijven van het debiteurnummer gebeurt pas bij het boeken (akkoord-verstuur).
  let twinfieldCode: string | null = null;
  const zoekNaam = d.koper?.bedrijf || d.koper?.naam || '';
  if (zoekNaam) {
    try {
      const huisnummer = (d.koper?.adres ?? '').match(/\d+/)?.[0] ?? null;
      const kandidaten = await searchDebiteurCandidates(zoekNaam, { postcode: d.koper?.postcode ?? null, huisnummer });
      const top = kandidaten[0];
      if (top && top.score >= 90) twinfieldCode = top.id; // sterke match: naam exact of postcode+huisnummer
    } catch { /* niet fataal */ }
  }

  // Controle: komt het berekende totaal overeen met CarCollect's "Te betalen"?
  const afwijking = d.te_betalen != null ? Math.abs(totalen.totaal_incl - d.te_betalen) : 0;
  const notitie = [
    `Geïmporteerd uit CarCollect-mail (${msg.ontvangenOp?.slice(0, 10) ?? ''}).`,
    d.btw_soort === 'btw' ? 'BTW-voertuig.' : 'Marge-voertuig.',
    d.te_betalen != null ? `CarCollect "Te betalen": € ${d.te_betalen.toFixed(2)}.` : '',
    afwijking > 0.5 ? `⚠ Berekend totaal € ${totalen.totaal_incl.toFixed(2)} wijkt af — controleer de regels.` : '',
    d.koper?.rdw_nummer ? `RDW-nr koper: ${d.koper.rdw_nummer}.` : '',
  ].filter(Boolean).join(' ');

  const { data: row, error } = await supabaseAdmin.from('uitgaande_facturen').insert({
    type: 'auto',
    soort: 'factuur',
    status: 'concept',
    bron: 'carcollect',
    bron_ref: ref,
    hubspot_company_id: null,
    klant_naam: d.koper?.bedrijf || d.koper?.naam || null,
    tav: d.koper?.naam || null,
    adres: d.koper?.adres || null,
    postcode: d.koper?.postcode || null,
    plaats: d.koper?.plaats || null,
    telefoon: d.koper?.telefoon || null,
    email: d.koper?.email || null,
    factuur_email: d.koper?.email || null,
    btw_nummer: d.koper?.btw_nummer || null,
    twinfield_debiteur_code: twinfieldCode,
    betaaltermijn_dagen: 0,
    regels,
    totaal_excl: totalen.totaal_excl,
    totaal_btw: totalen.totaal_btw,
    totaal_incl: totalen.totaal_incl,
    voertuig: {
      kenteken: d.kenteken || null,
      chassis: d.vin || null,
      merk: d.merk || null,
      model: d.model || null,
      km_stand: d.km_stand ?? null,
      btw_soort: d.btw_soort,
      rest_bpm: (d.rest_bpm ?? 0) > 0 ? d.rest_bpm : null,
      toe_te_betalen: d.te_betalen ?? null,
    },
    notitie,
  }).select('id').single();

  if (error) {
    // Unieke index op bron_ref → race met een gelijktijdige run: al aangemaakt = geen fout.
    if ((error as { code?: string }).code === '23505') {
      const { data: dup } = await supabaseAdmin
        .from('uitgaande_facturen').select('id').eq('bron_ref', ref).maybeSingle();
      return { ok: true, id: dup?.id, bestond: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: row.id, kenteken: d.kenteken ?? null, klant: d.koper?.bedrijf ?? null };
}

/** Haalt de info@-inbox op, filtert CarCollect-facturatieverzoeken en importeert ze (idempotent).
 *  Per run worden max `maxNieuw` NIEUWE facturen aangemaakt (AI-parsing is traag; Hobby cap = 60s) —
 *  de 15-min-cron werkt een eventuele achterstand vanzelf bij. Reeds geïmporteerde mails worden
 *  alleen (snel) overgeslagen en tellen niet mee voor de cap. */
export async function verwerkCarCollectInbox(token: string, mailbox: string, top = 50, maxNieuw = 6): Promise<{
  gescand: number; nieuw: number; bestond: number; genegeerd: number; fouten: number; resterend: number;
  resultaten: CarCollectImportResult[];
}> {
  // Deterministisch & compleet: lichte headers (datum-geordend, gepagineerd tot `top`) → kandidaten
  // filteren → body+AI alleen ophalen voor de écht nieuwe (cap maxNieuw). Betrouwbaarder dan $search.
  const { listMessageHeaders, getMessage } = await import('@/lib/graph/mail');
  const headers = await listMessageHeaders(token, mailbox, top);
  const kandidaten = headers.filter(
    (m) => /facturatieverzoek/i.test(m.subject) && /carcollect\.com/i.test(m.afzenderEmail),
  );

  // Welke kandidaten zijn al geïmporteerd? (1 query — bespaart body-ophalen + AI)
  const refs = kandidaten.map((c) => `carcollect:${c.id}`);
  const bestaand = new Set<string>();
  if (refs.length) {
    const { data } = await supabaseAdmin.from('uitgaande_facturen').select('bron_ref').in('bron_ref', refs);
    for (const r of data ?? []) if (r.bron_ref) bestaand.add(r.bron_ref);
  }

  const resultaten: CarCollectImportResult[] = [];
  let nieuw = 0, bestond = bestaand.size, genegeerd = 0, fouten = 0, resterend = 0;
  for (const c of kandidaten) {
    if (bestaand.has(`carcollect:${c.id}`)) continue; // al gedaan
    if (nieuw >= maxNieuw) { resterend++; continue; }  // cap → rest volgt volgende cron
    try {
      const full = await getMessage(token, mailbox, c.id);
      const r = await importeerCarCollectMail(full);
      resultaten.push(r);
      if (!r.ok) fouten++;
      else if (r.bestond) bestond++;
      else if (r.genegeerd) genegeerd++;
      else nieuw++;
    } catch (e) {
      fouten++; resultaten.push({ ok: false, error: String(e) });
    }
  }
  return { gescand: kandidaten.length, nieuw, bestond, genegeerd, fouten, resterend, resultaten };
}
