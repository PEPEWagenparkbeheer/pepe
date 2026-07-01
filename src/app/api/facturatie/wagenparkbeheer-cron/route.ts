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
import { getCompanyFields, verdeelWagenparkVoertuigen } from '@/lib/hubspot';
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

  const PF_VELDEN = ['name', 'address', 'zip', 'city', 'phone', 'kvk_nummer', 'twinfield_debiteur_code'];

  for (const cfg of configs ?? []) {
    const childs: { hubspot_company_id: string; naam?: string }[] = Array.isArray(cfg.child_company_ids)
      ? cfg.child_company_ids : [];
    const fee = Number(cfg.fee_per_voertuig) || 15;
    const parentId = cfg.parent_hubspot_company_id;

    // Verdeel voertuigen zonder dubbeltelling (dochter houdt eigen auto's, moeder alleen de rest).
    // Alle entiteiten = moeder (altijd) + dochters — dedup op id.
    const verdeling = await verdeelWagenparkVoertuigen(parentId, childs.map((c) => c.hubspot_company_id));
    const alleEntiteiten: { hubspot_company_id: string; naam?: string }[] = [
      { hubspot_company_id: parentId, naam: `${cfg.klant_naam ?? 'Moedermaatschappij'} (hoofd)` },
      ...childs.filter((c) => c.hubspot_company_id !== parentId),
    ];

    // ── Per entiteit: aparte factuur per entiteit (eigen debiteur) ──
    if (cfg.per_entiteit) {
      for (const child of alleEntiteiten) {
        const childKey = `wpb-${child.hubspot_company_id}-${periode}`;
        const { data: al } = await supabaseAdmin
          .from('uitgaande_facturen').select('id').eq('recurring_key', childKey).maybeSingle();
        if (al) { resultaat.push({ klant: child.naam ?? child.hubspot_company_id, status: 'bestond al' }); continue; }
        const { kentekens, aantal } = verdeling[child.hubspot_company_id] ?? { kentekens: [], aantal: 0 };
        if (aantal === 0) { resultaat.push({ klant: child.naam ?? child.hubspot_company_id, status: 'geen voertuigen', aantal: 0 }); continue; }
        const cf = await getCompanyFields(child.hubspot_company_id, PF_VELDEN).catch(() => ({} as Record<string, string>));
        const cRegels: FactuurRegel[] = [{ omschrijving: `Wagenparkbeheer — periode ${label}`, aantal, prijs_excl: fee, btw_code: 'hoog' }];
        const cTot = berekenTotalen(cRegels);
        const { error: cErr } = await supabaseAdmin.from('uitgaande_facturen').insert({
          type: 'wagenparkbeheer', soort: 'factuur', status: 'ter_controle',
          hubspot_company_id: child.hubspot_company_id,
          klant_naam: (cf.name as string) ?? child.naam ?? null,
          adres: (cf.address as string) ?? null, postcode: (cf.zip as string) ?? null, plaats: (cf.city as string) ?? null,
          telefoon: (cf.phone as string) ?? null, kvk: (cf.kvk_nummer as string) ?? null,
          twinfield_debiteur_code: (cf.twinfield_debiteur_code as string) ?? null,
          betaaltermijn_dagen: 14, regels: cRegels,
          totaal_excl: cTot.totaal_excl, totaal_btw: cTot.totaal_btw, totaal_incl: cTot.totaal_incl,
          bijlage: { entiteiten: [{ naam: child.naam ?? child.hubspot_company_id, aantal, bedrag: aantal * fee, kentekens }] },
          bron: 'recurring', periode, recurring_key: childKey,
        });
        resultaat.push({ klant: (cf.name as string) ?? child.naam ?? child.hubspot_company_id, status: cErr ? `fout: ${cErr.message}` : 'klaargezet', aantal });
      }
      continue;
    }

    // ── Moedermaatschappij: één factuur met bijlage per dochter (default) ──
    const recurringKey = `wpb-${cfg.parent_hubspot_company_id}-${periode}`;
    const { data: bestaat } = await supabaseAdmin
      .from('uitgaande_facturen').select('id').eq('recurring_key', recurringKey).maybeSingle();
    if (bestaat) { resultaat.push({ klant: cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: 'bestond al' }); continue; }

    const entiteiten: BijlageEntiteit[] = [];
    let totaalAantal = 0;

    for (const child of alleEntiteiten) {
      const { kentekens, aantal } = verdeling[child.hubspot_company_id] ?? { kentekens: [], aantal: 0 };
      if (aantal === 0) continue; // entiteiten zonder eigen voertuigen niet in de bijlage
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
    await supabaseAdmin.from('wagenparkbeheer_config')
      .update({ laatst_aantal: totaalAantal, laatst_periode: periode }).eq('id', cfg.id);
    resultaat.push({ klant: (pf.name as string) ?? cfg.klant_naam ?? cfg.parent_hubspot_company_id, status: 'klaargezet', aantal: totaalAantal });
  }

  return NextResponse.json({ ok: true, periode, resultaat });
}
