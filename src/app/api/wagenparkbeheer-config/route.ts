// GET  /api/wagenparkbeheer-config  — alle config-records
// POST /api/wagenparkbeheer-config  — nieuwe config (parent + childs + fee)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { data, error } = await supabaseAdmin
    .from('wagenparkbeheer_config').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const b = await req.json().catch(() => ({}));
  if (!b.parent_hubspot_company_id) {
    return NextResponse.json({ error: 'parent_hubspot_company_id vereist' }, { status: 400 });
  }
  const insert = {
    parent_hubspot_company_id: String(b.parent_hubspot_company_id),
    klant_naam: b.klant_naam ?? null,
    fee_per_voertuig: Number(b.fee_per_voertuig) || 15,
    child_company_ids: Array.isArray(b.child_company_ids) ? b.child_company_ids : [],
    betaaldag: Number(b.betaaldag) || 1,
    actief: b.actief !== false,
    notitie: b.notitie ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from('wagenparkbeheer_config').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}
