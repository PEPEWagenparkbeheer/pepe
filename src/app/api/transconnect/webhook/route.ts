import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Shared secret tussen TransConnect (in de geregistreerde callback-URL) en deze route.
// Zodra TRANSCONNECT_WEBHOOK_SECRET is gezet, wordt het afgedwongen; daarvoor blijft de
// route open (huidig gedrag) zodat aanlevering niet onverwacht stopt. Activeren:
// 1) env-var zetten, 2) POST /api/transconnect/register-webhook opnieuw aanroepen
// (de nieuwe callback-URL bevat dan ?secret=…).
const WEBHOOK_SECRET = process.env.TRANSCONNECT_WEBHOOK_SECRET ?? '';

// TransConnect stuurt status-updates via POST naar:
// https://<domein>/api/transconnect/webhook
// Registreren via POST /api/transconnect/register-webhook
export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const provided =
      req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-webhook-secret');
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Geen geldig JSON' }, { status: 400 });

  // TC payload veldnamen (bevestigd via API: order_status, planned_arrival_date, arrival_date)
  const orderId: string = String(body.order_id ?? body.orderId ?? body.id ?? '');
  // chassis: TC stuurt dit mogelijk als vehicle_chassis_number, chassis_number of vin
  const chassis: string = String(
    body.vehicle_chassis_number ?? body.chassis_number ?? body.vin ?? body.chassis ?? ''
  ).toUpperCase().replace(/\s/g, '');
  // status normaliseren: spaties → underscore, lowercase ("Picked Up" → "picked_up")
  const status: string  = String(body.order_status ?? body.status ?? body.state ?? '')
    .toLowerCase().replace(/\s+/g, '_');
  const geplandeDatum: string | undefined =
    body.planned_arrival_date ?? body.planned_pickup_date ?? body.planned_date ?? body.pickup_date;
  const aankomstDatum: string | undefined =
    body.arrival_date ?? body.delivery_date ?? body.delivered_date;

  if (!orderId) return NextResponse.json({ error: 'Geen order_id' }, { status: 400 });

  // ── Stap 1: zoek via transport_order_id (na eerste koppeling het snelste pad) ──
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
    // ── Stap 2: eerste keer — koppelen via laatste 4 cijfers chassisnummer = kenteken_clean ──
    // Voor import-records bevat `kenteken` de laatste 4 van het chassisnummer (meldcode).
    const chassis4 = chassis.slice(-4).toUpperCase();

    const { data: gevonden } = await supabase
      .from('after_sales')
      .select('id')
      .eq('kenteken_clean', chassis4)
      .eq('gearchiveerd', false)
      .eq('type', 'import')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gevonden) {
      recordId = gevonden.id;
      // Sla order_id op zodat volgende webhooks direct via stap 1 matchen
      await supabase.from('after_sales').update({ transport_order_id: orderId }).eq('id', recordId);
    }
  }

  if (!recordId) {
    console.warn('TransConnect webhook: geen record gevonden voor order', orderId, 'chassis', chassis);
    return NextResponse.json({ ok: false, error: 'Record niet gevonden' }, { status: 404 });
  }

  // Status vertalen naar PEPE-veldwijzigingen
  const update: Record<string, unknown> = {
    transport_status: body.order_status ?? status,
    transport_status_updated_at: new Date().toISOString(),
    aangevraagd: true,
  };

  const isGepland = status.includes('planned') || status.includes('gepland') ||
    status.includes('confirmed') || status.includes('created') || status.includes('uitvoering');
  if (geplandeDatum && isGepland) {
    update.transportdatum = geplandeDatum.slice(0, 10);
  }

  if (status.includes('delivered') || status.includes('afgeleverd') ||
      status.includes('aangekomen') || aankomstDatum) {
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
