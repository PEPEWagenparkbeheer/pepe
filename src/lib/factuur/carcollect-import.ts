// Maakt van een CarCollect "Facturatieverzoek"-mail (afzender noreply@carcollect.com) een
// auto-verkoopfactuur in status 'concept'. Anders dan de DocuSign-import bevat deze mail ál het
// nodige (kenteken, VIN, km, koper-NAW én de complete prijsopbouw) — dus geen 'aanvullen', maar
// direct een compleet concept dat PEPE alleen nog hoeft goed te keuren en te versturen.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { searchCompanyByName, getCompanyFields } from '@/lib/hubspot';
import { berekenTotalen } from '@/lib/factuur/btw';
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

  // Optionele HubSpot-koppeling: company-id (+ bestaand debiteurnummer) op bedrijfsnaam.
  let companyId: string | null = null;
  let twinfieldCode: string | null = null;
  if (d.koper?.bedrijf) {
    try {
      const id = await searchCompanyByName(d.koper.bedrijf);
      if (id) {
        companyId = id;
        const f = await getCompanyFields(id, ['twinfield_debiteur_code']);
        twinfieldCode = (f?.twinfield_debiteur_code as string) || null;
      }
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
    hubspot_company_id: companyId,
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

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: row.id, kenteken: d.kenteken ?? null, klant: d.koper?.bedrijf ?? null };
}

/** Haalt de info@-inbox op, filtert CarCollect-facturatieverzoeken en importeert ze (idempotent). */
export async function verwerkCarCollectInbox(token: string, mailbox: string, top = 40): Promise<{
  gescand: number; nieuw: number; bestond: number; genegeerd: number; fouten: number;
  resultaten: CarCollectImportResult[];
}> {
  const { getRecentMessages } = await import('@/lib/graph/mail');
  const berichten = await getRecentMessages(token, mailbox, top);
  const verzoeken = berichten.filter(
    (m) => /facturatieverzoek/i.test(m.subject) && /carcollect\.com/i.test(m.afzenderEmail),
  );

  const resultaten: CarCollectImportResult[] = [];
  let nieuw = 0, bestond = 0, genegeerd = 0, fouten = 0;
  for (const m of verzoeken) {
    const r = await importeerCarCollectMail(m).catch((e) => ({ ok: false, error: String(e) } as CarCollectImportResult));
    resultaten.push(r);
    if (!r.ok) fouten++;
    else if (r.bestond) bestond++;
    else if (r.genegeerd) genegeerd++;
    else nieuw++;
  }
  return { gescand: verzoeken.length, nieuw, bestond, genegeerd, fouten, resultaten };
}
