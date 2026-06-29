// GET /api/facturatie/shortlease-cron — Vercel Cron (maandelijks).
// Zet per debiteur een shortlease-doorbelasting klaar als CONCEPT (ter_controle): één regel per
// shortlease-auto, NAAR RATO van de dagen dat het contract in de maand liep.
//
// Vereist in HubSpot: deals met type_aanschaf = "Shortlease via PEPE" + een maandhuur-property
// (probeert shortlease_maandbedrag/maandhuur/leasebedrag) + inzetdatum/verwachte_einddatum.
// Staat leeg zolang er geen shortlease-deals zijn.
//
// Auth: Bearer/?secret=CRON_SECRET of ingelogde PEPE. Optioneel ?periode=YYYY-MM.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { getShortleaseDeals, getDealCompanyId, getDealBerijderNaam, getCompanyFields } from '@/lib/hubspot';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel } from '@/types/factuur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function proRata(periode: string, inzet: string | null, eind: string | null) {
  const [j, m] = periode.split('-').map(Number);
  const maandStart = new Date(j, m - 1, 1);
  const maandEind = new Date(j, m, 0);
  const dagenInMaand = maandEind.getDate();
  const start = inzet ? new Date(inzet) : maandStart;
  const end = eind ? new Date(eind) : maandEind;
  const effStart = start > maandStart ? start : maandStart;
  const effEind = end < maandEind ? end : maandEind;
  if (effEind < effStart) return { ratio: 0, dagen: 0, dagenInMaand };
  const dagen = Math.round((effEind.getTime() - effStart.getTime()) / 86400000) + 1;
  return { ratio: Math.min(1, dagen / dagenInMaand), dagen, dagenInMaand };
}

function maandLabel(periode: string) {
  const [j, m] = periode.split('-').map(Number);
  return new Date(j, (m || 1) - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
}

async function geautoriseerd(req: NextRequest): Promise<boolean> {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (CRON_SECRET && (secret === CRON_SECRET || bearer === CRON_SECRET)) return true;
  const gate = await requireFacturatie(req);
  return gate.ok;
}

export async function GET(req: NextRequest) {
  if (!(await geautoriseerd(req))) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });

  const url = new URL(req.url);
  const now = new Date();
  const periode = url.searchParams.get('periode')
    || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = maandLabel(periode);

  const deals = await getShortleaseDeals();

  // Groepeer per debiteur (company)
  const perCompany = new Map<string, { regels: FactuurRegel[] }>();
  for (const d of deals) {
    if (d.maandhuur == null) continue;
    const { ratio, dagen, dagenInMaand } = proRata(periode, d.inzetdatum, d.verwachte_einddatum);
    if (ratio <= 0) continue;
    const companyId = await getDealCompanyId(d.id).catch(() => null);
    if (!companyId) continue;
    const berijder = await getDealBerijderNaam(d.id).catch(() => null);
    const bedrag = round2(d.maandhuur * ratio);
    const wie = berijder ? ` — ${berijder}` : '';
    const oms = ratio < 1
      ? `Shortlease ${d.kenteken}${wie} — ${label} (${dagen}/${dagenInMaand} dagen)`
      : `Shortlease ${d.kenteken}${wie} — ${label}`;
    const g = perCompany.get(companyId) ?? { regels: [] };
    g.regels.push({ omschrijving: oms, aantal: 1, prijs_excl: bedrag, btw_code: 'hoog' });
    perCompany.set(companyId, g);
  }

  const resultaat: { company: string; status: string; regels?: number }[] = [];
  for (const [companyId, g] of perCompany) {
    const recurringKey = `sl-${companyId}-${periode}`;
    const { data: bestaat } = await supabaseAdmin
      .from('uitgaande_facturen').select('id').eq('recurring_key', recurringKey).maybeSingle();
    if (bestaat) { resultaat.push({ company: companyId, status: 'bestond al' }); continue; }

    const pf = await getCompanyFields(companyId,
      ['name', 'address', 'zip', 'city', 'phone', 'kvk_nummer', 'twinfield_debiteur_code', 'mailadres_tbv_facturatie'],
    ).catch(() => ({} as Record<string, string>));
    const totalen = berekenTotalen(g.regels);

    const { error } = await supabaseAdmin.from('uitgaande_facturen').insert({
      type: 'shortlease', soort: 'factuur', status: 'ter_controle',
      hubspot_company_id: companyId,
      klant_naam: (pf.name as string) ?? null,
      adres: (pf.address as string) ?? null,
      postcode: (pf.zip as string) ?? null,
      plaats: (pf.city as string) ?? null,
      telefoon: (pf.phone as string) ?? null,
      email: (pf.mailadres_tbv_facturatie as string) ?? null,
      factuur_email: (pf.mailadres_tbv_facturatie as string) ?? null,
      kvk: (pf.kvk_nummer as string) ?? null,
      twinfield_debiteur_code: (pf.twinfield_debiteur_code as string) ?? null,
      betaaltermijn_dagen: 14,
      regels: g.regels,
      totaal_excl: totalen.totaal_excl,
      totaal_btw: totalen.totaal_btw,
      totaal_incl: totalen.totaal_incl,
      bron: 'recurring', periode, recurring_key: recurringKey,
    });
    if (error) { resultaat.push({ company: (pf.name as string) ?? companyId, status: `fout: ${error.message}` }); continue; }
    resultaat.push({ company: (pf.name as string) ?? companyId, status: 'klaargezet', regels: g.regels.length });
  }

  return NextResponse.json({ ok: true, periode, gevonden_deals: deals.length, resultaat });
}
