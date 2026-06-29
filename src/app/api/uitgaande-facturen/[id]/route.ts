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
  'periode', 'notitie',
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
    .from('uitgaande_facturen').select('status').eq('id', id).maybeSingle();
  if (huidig && ['definitief', 'verzonden'].includes(huidig.status)) {
    return NextResponse.json({ error: 'Definitieve factuur kan niet meer gewijzigd worden' }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  for (const v of VELDEN) if (v in body) patch[v] = body[v];

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ factuur: data });
}
