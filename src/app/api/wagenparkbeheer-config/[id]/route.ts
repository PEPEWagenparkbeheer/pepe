// PATCH  /api/wagenparkbeheer-config/[id]  — bijwerken
// DELETE /api/wagenparkbeheer-config/[id]  — verwijderen
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const VELDEN = [
  'parent_hubspot_company_id', 'klant_naam', 'fee_per_voertuig',
  'child_company_ids', 'betaaldag', 'actief', 'notitie', 'per_entiteit',
] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const v of VELDEN) if (v in b) patch[v] = b[v];
  const { data, error } = await supabaseAdmin
    .from('wagenparkbeheer_config').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  // Definitief verwijderen vereist pincode (zelfde als crediteren).
  const pin = new URL(req.url).searchParams.get('pin') ?? '';
  const vereist = process.env.FACTURATIE_CREDIT_PIN ?? '';
  if (vereist && pin !== vereist) return NextResponse.json({ error: 'Onjuiste pincode' }, { status: 403 });
  const { error } = await supabaseAdmin.from('wagenparkbeheer_config').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
