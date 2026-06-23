import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  let body: { company_code?: string };
  try {
    body = (await req.json()) as { company_code?: string };
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  const { company_code } = body;
  if (!company_code?.trim()) {
    return NextResponse.json({ error: 'company_code is vereist' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('twinfield_auth')
    .update({ company_code: company_code.trim() })
    .eq('id', 'singleton');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
