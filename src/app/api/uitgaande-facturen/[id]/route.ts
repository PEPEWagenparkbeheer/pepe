// GET   /api/uitgaande-facturen/[id]  — één factuur
// PATCH /api/uitgaande-facturen/[id]  — bijwerken (incrementeel aanvullen)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel } from '@/types/factuur';

export const runtime = 'nodejs';

const VELDEN = [
  'type', 'soort', 'status', 'hubspot_company_id', 'twinfield_debiteur_code', 'klant_naam', 'tav', 'adres',
  'postcode', 'plaats', 'telefoon', 'email', 'factuur_email', 'kvk', 'btw_nummer',
  'factuurdatum', 'vervaldatum', 'betaaltermijn_dagen', 'voertuig', 'bijlage',
  'periode', 'notitie', 'handelsconditie', 'land',
] as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  return NextResponse.json({ factuur: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  // Definitieve/verzonden facturen niet meer wijzigen (Twinfield is leidend).
  const { data: huidig } = await supabaseAdmin
    .from('uitgaande_facturen').select('status, after_sales_id').eq('id', id).maybeSingle();
  if (huidig && ['definitief', 'verzonden'].includes(huidig.status)) {
    return NextResponse.json({ error: 'Definitieve factuur kan niet meer gewijzigd worden' }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  for (const v of VELDEN) if (v in body) patch[v] = body[v];

  // Koppeling aan een after-sales-auto: guard tegen dubbele koppeling.
  let gekoppeldeId: string | null = null;
  if ('after_sales_id' in body) {
    gekoppeldeId = body.after_sales_id ? String(body.after_sales_id) : null;
    if (gekoppeldeId && huidig?.after_sales_id && huidig.after_sales_id !== gekoppeldeId) {
      return NextResponse.json({ error: 'Deze factuur is al aan een andere auto gekoppeld' }, { status: 409 });
    }
    patch.after_sales_id = gekoppeldeId;
  }

  if ('regels' in body && Array.isArray(body.regels)) {
    const regels = body.regels as FactuurRegel[];
    const t = berekenTotalen(regels);
    patch.regels = regels;
    patch.totaal_excl = t.totaal_excl;
    patch.totaal_btw = t.totaal_btw;
    patch.totaal_incl = t.totaal_incl;
  }

  const { data, error } = await supabaseAdmin
    .from('uitgaande_facturen').update(patch).eq('id', id).select('*').single();
  if (error) {
    // Partial unique index op after_sales_id → die auto hangt al aan een andere factuur.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Die auto is al aan een andere factuur gekoppeld' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Zojuist gekoppeld → reeds bekende after-sales-data (kenteken/chassis/rest-BPM) direct laten instromen.
  if (gekoppeldeId) {
    try {
      const { syncAfterSalesNaarFactuur } = await import('@/lib/factuur/import-sync');
      await syncAfterSalesNaarFactuur(gekoppeldeId);
    } catch { /* niet fataal */ }
  }

  return NextResponse.json({ factuur: data });
}
