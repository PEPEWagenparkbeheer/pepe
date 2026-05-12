import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// TransConnect stuurt status-updates via POST naar deze URL.
// Stel in het TransConnect portaal in als webhook-URL:
// https://<jouw-domein>/api/transconnect/webhook
//
// TODO na ontvangst sandbox-docs: vul exacte payload-structuur en handtekening-validatie in.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Geen geldig JSON' }, { status: 400 });

  // TODO: valideer webhook-handtekening zodra TransConnect dat specificeert
  // const sig = req.headers.get('x-transconnect-signature');
  // if (!valideerHandtekening(sig, body)) return NextResponse.json({ error: 'Ongeldige handtekening' }, { status: 401 });

  const orderId: string = body.order_id ?? body.orderId ?? body.id;
  const status: string  = body.status ?? body.state ?? '';
  const geplandeDatum: string | undefined = body.planned_date ?? body.geplande_datum;
  const aankomstDatum: string | undefined = body.delivery_date ?? body.aankomst_datum;

  if (!orderId) return NextResponse.json({ error: 'Geen order_id' }, { status: 400 });

  // Zoek het after_sales record op via het TransConnect order-ID
  const { data: record, error: zoekFout } = await supabase
    .from('after_sales')
    .select('id, binnen')
    .eq('transport_order_id', orderId)
    .single();

  if (zoekFout || !record) {
    console.warn('TransConnect webhook: order_id niet gevonden:', orderId);
    return NextResponse.json({ ok: false, error: 'Record niet gevonden' }, { status: 404 });
  }

  // Bepaal wat er bijgewerkt moet worden op basis van de status
  const update: Record<string, unknown> = {
    transport_status: status,
    transport_status_updated_at: new Date().toISOString(),
  };

  const statusLower = status.toLowerCase();

  if (geplandeDatum && (statusLower.includes('bevestigd') || statusLower.includes('gepland') || statusLower.includes('planned'))) {
    update.transportdatum = geplandeDatum.slice(0, 10);
  }

  if (aankomstDatum || statusLower.includes('afgeleverd') || statusLower.includes('arrived') || statusLower.includes('aangekomen')) {
    update.binnen = true;
    update.binnen_op = (aankomstDatum ?? new Date().toISOString()).slice(0, 10);
  }

  const { error: updateFout } = await supabase
    .from('after_sales')
    .update(update)
    .eq('id', record.id);

  if (updateFout) {
    console.error('TransConnect webhook: update mislukt:', updateFout);
    return NextResponse.json({ error: 'Update mislukt' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
