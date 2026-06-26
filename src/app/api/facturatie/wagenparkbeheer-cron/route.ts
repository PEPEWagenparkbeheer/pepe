// GET /api/facturatie/wagenparkbeheer-cron — Vercel Cron (maandelijks, 1e van de maand).
// Zet per actieve config een wagenparkbeheer-factuur klaar als CONCEPT (status ter_controle):
//   - telt rijdende deals per dochteronderneming (HubSpot)
//   - bouwt bijlage met kentekens per entiteit
//   - maandfee-regel (aantal = totaal voertuigen) tegen de ingestelde fee
// Idempotent via recurring_key (debiteur+periode). Daarna controleert PEPE in /facturatie
// en klikt "Akkoord & verstuur".
//
// Auth: Vercel stuurt Authorization: Bearer <CRON_SECRET>. Handmatig testen: ?secret=<CRON_SECRET>
// (of als ingelogde PEPE-medewerker). Optioneel ?periode=YYYY-MM om een specifieke maand te draaien.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { getCompanyFields, getRijdendeDealsForCompany } from '@/lib/hubspot';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel, BijlageEntiteit } from '@/types/factuur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

function maandLabel(periode: string): string {
  const [j, m] = periode.split('-').map(Number);
  const naam = new Date(j, (m || 1) - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  return naam;
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
  if (!(await geautoriseerd(req))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const periode = url.searchParams.get('periode')
    || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = maandLabel(periode);

  const { data: configs, error } = await supabaseAdmin
    .from('wagenparkbeheer_config').select('*').eq('actief', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultaat: { klant: string; status: string; aantal?: number }[] = [];

  for (const cfg of configs ?? []) {
    const recurringKey = `wpb-${cfg.parent_hubspot_company_id}-${periode}`;

    // Idempotent: bestaat deze al?
    const { data: bestaat } = await supabaseAdmin
      .from('uitgaande_facturen').select('id').eq('recurring_key', recurringKey).maybeSingle();
    if (bestaat) { resultaat.push({ klant: cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: 'bestond al' }); continue; }

    // Voertuigen per dochteronderneming tellen
    const childs: { hubspot_company_id: string; naam?: string }[] = Array.isArray(cfg.child_company_ids)
      ? cfg.child_company_ids : [];
    const fee = Number(cfg.fee_per_voertuig) || 15;
    const entiteiten: BijlageEntiteit[] = [];
    let totaalAantal = 0;

    for (const child of childs) {
      const { kentekens, aantal } = await getRijdendeDealsForCompany(child.hubspot_company_id);
      entiteiten.push({ naam: child.naam ?? child.hubspot_company_id, aantal, bedrag: aantal * fee, kentekens });
      totaalAantal += aantal;
    }

    if (totaalAantal === 0) {
      resultaat.push({ klant: cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: 'geen voertuigen', aantal: 0 });
      continue;
    }

    // Debiteur-NAW snapshot van de moedermaatschappij
    const pf = await getCompanyFields(cfg.parent_hubspot_company_id,
      ['name', 'address', 'zip', 'city', 'phone', 'kvk_nummer', 'twinfield_debiteur_code'],
    ).catch(() => ({} as Record<string, string>));

    const regels: FactuurRegel[] = [{
      omschrijving: `Wagenparkbeheer — periode ${label}`,
      aantal: totaalAantal,
      prijs_excl: fee,
      btw_code: 'hoog',
    }];
    const totalen = berekenTotalen(regels);

    const { error: insErr } = await supabaseAdmin.from('uitgaande_facturen').insert({
      type: 'wagenparkbeheer',
      soort: 'factuur',
      status: 'ter_controle',
      hubspot_company_id: cfg.parent_hubspot_company_id,
      klant_naam: (pf.name as string) ?? cfg.klant_naam ?? null,
      adres: (pf.address as string) ?? null,
      postcode: (pf.zip as string) ?? null,
      plaats: (pf.city as string) ?? null,
      telefoon: (pf.phone as string) ?? null,
      kvk: (pf.kvk_nummer as string) ?? null,
      twinfield_debiteur_code: (pf.twinfield_debiteur_code as string) ?? null,
      betaaltermijn_dagen: 14,
      regels,
      totaal_excl: totalen.totaal_excl,
      totaal_btw: totalen.totaal_btw,
      totaal_incl: totalen.totaal_incl,
      bijlage: { entiteiten },
      bron: 'recurring',
      periode,
      recurring_key: recurringKey,
    });
    if (insErr) { resultaat.push({ klant: cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: `fout: ${insErr.message}` }); continue; }
    resultaat.push({ klant: (pf.name as string) ?? cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: 'klaargezet', aantal: totaalAantal });
  }

  return NextResponse.json({ ok: true, periode, resultaat });
}
