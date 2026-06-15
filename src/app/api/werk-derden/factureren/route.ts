// POST /api/werk-derden/factureren
// Body: { id: string, verkoop_bedrag: number }
// 1. Haal de melding op uit Supabase
// 2. Roep Twinfield aan (stub)
// 3. Update status → 'gefactureerd' + twinfield_invoice_id + gefactureerd_op + verkoop_bedrag

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldInvoice } from '@/lib/twinfield';
import type { WerkDerdenRecord, WerkRegel } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let body: { id?: string; verkoop_bedrag?: number };
  try {
    body = (await req.json()) as { id?: string; verkoop_bedrag?: number };
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  const { id, verkoop_bedrag } = body;
  if (!id || typeof verkoop_bedrag !== 'number' || verkoop_bedrag <= 0) {
    return NextResponse.json({ error: 'id en verkoop_bedrag zijn vereist' }, { status: 400 });
  }

  // Haal de melding op
  const { data: raw, error: fetchErr } = await admin
    .from('werk_derden')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !raw) {
    return NextResponse.json({ error: 'Melding niet gevonden' }, { status: 404 });
  }

  const rec = raw as unknown as WerkDerdenRecord;

  if (rec.status === 'gefactureerd') {
    return NextResponse.json({ error: 'Al gefactureerd' }, { status: 409 });
  }

  // Twinfield aanroepen (stub)
  const twResult = await createTwinfieldInvoice({
    werk_derden_id: rec.id,
    kenteken: rec.kenteken,
    klant: rec.klant,
    partner: rec.partner,
    regels: (rec.regels as WerkRegel[]),
    btw_pct: rec.btw_pct ?? 21,
    verkoop_bedrag,
    notitie: rec.notitie,
  });

  if (!twResult.ok) {
    return NextResponse.json({ error: `Twinfield fout: ${twResult.error}` }, { status: 502 });
  }

  // Update Supabase
  const { error: updateErr } = await admin
    .from('werk_derden')
    .update({
      status: 'gefactureerd',
      verkoop_bedrag,
      gefactureerd_op: new Date().toISOString(),
      twinfield_invoice_id: twResult.invoice_id ?? null,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, twinfield_invoice_id: twResult.invoice_id });
}
