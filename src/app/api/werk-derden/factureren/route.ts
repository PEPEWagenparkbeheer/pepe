// POST /api/werk-derden/factureren
// Body: { id: string, marge_type: 'pct' | 'bedrag', marge_waarde: number }
// Vereiste status: 'goedgekeurd'
// 1. Haal de melding op uit Supabase
// 2. Bereken verkoop_bedrag uit inkoop + marge
// 3. Roep Twinfield aan (stub)
// 4. Update status → 'gefactureerd' + marge + verkoop + twinfield_invoice_id + gefactureerd_op

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldInvoice } from '@/lib/twinfield';
import { requirePepe } from '@/lib/apiAuth';
import type { WerkDerdenRecord, WerkRegel } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let body: { id?: string; marge_type?: string; marge_waarde?: number };
  try {
    body = (await req.json()) as { id?: string; marge_type?: string; marge_waarde?: number };
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  const { id, marge_type, marge_waarde } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is vereist' }, { status: 400 });
  }
  if (marge_type !== 'pct' && marge_type !== 'bedrag') {
    return NextResponse.json({ error: 'marge_type moet "pct" of "bedrag" zijn' }, { status: 400 });
  }
  if (typeof marge_waarde !== 'number' || marge_waarde < 0) {
    return NextResponse.json({ error: 'marge_waarde moet een positief getal zijn' }, { status: 400 });
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

  if (rec.status !== 'goedgekeurd') {
    return NextResponse.json(
      { error: `Kan niet factureren: status is "${rec.status}" (verwacht "goedgekeurd")` },
      { status: 409 },
    );
  }

  // Voertuigprijs-meldingen (gekoppeld aan After Sales auto) mogen niet via Twinfield
  // gefactureerd worden — de kosten zitten al in de voertuigprijs. Gebruik 'Afronden'.
  if (rec.after_sales_id || (rec as unknown as Record<string,unknown>).bestemming === 'voertuigprijs') {
    return NextResponse.json(
      { error: 'Voertuigprijs-melding kan niet via Twinfield gefactureerd worden. Gebruik de Afronden-actie.' },
      { status: 409 },
    );
  }

  // Bereken verkoop bedrag
  const inkoop =
    rec.inkoop_bedrag ??
    (rec.regels as WerkRegel[]).reduce((s, r) => s + r.bedrag, 0);

  const verkoop_bedrag =
    marge_type === 'pct'
      ? inkoop * (1 + marge_waarde / 100)
      : inkoop + marge_waarde;

  if (verkoop_bedrag <= 0) {
    return NextResponse.json({ error: 'Berekend verkoopbedrag is niet geldig' }, { status: 400 });
  }

  const twResult = await createTwinfieldInvoice({
    werk_derden_id: rec.id,
    kenteken: rec.kenteken ?? rec.meldcode ?? '',
    klant: rec.klant,
    partner: rec.partner,
    regels: rec.regels as WerkRegel[],
    btw_pct: rec.btw_pct ?? 21,
    verkoop_bedrag,
    notitie: rec.notitie,
    hubspot_deal_id: rec.hubspot_deal_id ?? undefined,
  });

  if (!twResult.ok) {
    return NextResponse.json({ error: `Twinfield fout: ${twResult.error}` }, { status: 502 });
  }

  // Update Supabase
  const { error: updateErr } = await admin
    .from('werk_derden')
    .update({
      status: 'gefactureerd',
      marge_type,
      marge_waarde,
      verkoop_bedrag,
      gefactureerd_op: new Date().toISOString(),
      twinfield_invoice_id: twResult.invoice_id ?? null,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, twinfield_invoice_id: twResult.invoice_id, verkoop_bedrag });
}
