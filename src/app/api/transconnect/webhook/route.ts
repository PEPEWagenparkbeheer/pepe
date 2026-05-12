import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// TransConnect stuurt status-updates via POST naar:
// https://<domein>/api/transconnect/webhook
// Registreren via POST /api/transconnect/register-webhook
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Geen geldig JSON' }, { status: 400 });

  // TC order-ID en chassisnummer uit de payload halen
  const orderId: string = String(body.order_id ?? body.orderId ?? body.id ?? '');
  const chassis: string = String(body.vehicle_chassis_number ?? body.chassis_number ?? body.vin ?? '').toUpperCase().replace(/\s/g, '');
  const status: string  = String(body.status ?? body.state ?? '').toLowerCase();
  const geplandeDatum: string | undefined = body.planned_date ?? body.pickup_date;
  const aankomstDatum: string | undefined = body.delivery_date ?? body.delivered_date;

  if (!orderId) return NextResponse.json({ error: 'Geen order_id' }, { status: 400 });

  // ── Stap 1: zoek record op via transport_order_id (snelste pad na eerste koppeling) ──
  let recordId: string | null = null;

  const { data: bestaand } = await supabase
    .from('after_sales')
    .select('id')
    .eq('transport_order_id', orderId)
    .eq('gearchiveerd', false)
    .maybeSingle();

  if (bestaand) {
    recordId = bestaand.id;
  } else if (chassis.length >= 4) {
    // ── Stap 2: eerste keer — koppelen via laatste 4 cijfers chassisnummer = meldcode ──
    const chassis4 = chassis.slice(-4);

    const { data: gevonden } = await supabase
      .from('after_sales')
      .select('id')
      .ilike('kenteken_clean', `%${chassis4}%`)
      .eq('gearchiveerd', false)
      .eq('type', 'import')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gevonden) {
      recordId = gevonden.id;
      // Sla order_id op voor volgende webhook-calls
      await supabase.from('after_sales').update({ transport_order_id: orderId }).eq('id', recordId);
    }
  }

  if (!recordId) {
    console.warn('TransConnect webhook: geen record gevonden voor order', orderId, 'chassis', chassis);
    return NextResponse.json({ ok: false, error: 'Record niet gevonden' }, { status: 404 });
  }

  // ── Stap 3: status vertalen naar PEPE-veldwijzigingen ──
  const update: Record<string, unknown> = {
    transport_status: body.status ?? status,
    transport_status_updated_at: new Date().toISOString(),
    aangevraagd: true,
  };

  if (geplandeDatum && (status.includes('planned') || status.includes('confirmed') || status.includes('created'))) {
    update.transportdatum = geplandeDatum.slice(0, 10);
  }

  if (status.includes('picked_up') || status.includes('in_transit') || status.includes('onderweg')) {
    // Geen extra datumvelden, transport_status is al gezet
  }

  if (status.includes('delivered') || status.includes('aangekomen') || aankomstDatum) {
    update.binnen      = true;
    update.binnen_op   = (aankomstDatum ?? new Date().toISOString()).slice(0, 10);
  }

  const { error } = await supabase.from('after_sales').update(update).eq('id', recordId);
  if (error) {
    console.error('TransConnect webhook update mislukt:', error);
    return NextResponse.json({ error: 'Update mislukt' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
