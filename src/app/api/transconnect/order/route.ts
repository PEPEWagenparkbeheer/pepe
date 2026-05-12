import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { maakTransportOrder } from '@/lib/transconnect';
import type { AfterSalesAuto } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/transconnect/order
// Body: { after_sales_id: string }
// Plaatst een transportorder bij TransConnect en slaat het order-ID op.
export async function POST(req: NextRequest) {
  const { after_sales_id } = await req.json().catch(() => ({}));
  if (!after_sales_id) return NextResponse.json({ error: 'Geen after_sales_id' }, { status: 400 });

  const { data: auto, error } = await supabase
    .from('after_sales')
    .select('*')
    .eq('id', after_sales_id)
    .single();

  if (error || !auto) return NextResponse.json({ error: 'Auto niet gevonden' }, { status: 404 });
  if (auto.aangevraagd && auto.transport_order_id) {
    return NextResponse.json({ error: 'Transport al aangevraagd', order_id: auto.transport_order_id }, { status: 409 });
  }

  const result = await maakTransportOrder(auto as AfterSalesAuto);

  await supabase.from('after_sales').update({
    aangevraagd: true,
    transport_order_id: result.order_id,
    transport_status: result.status,
    transport_status_updated_at: new Date().toISOString(),
  }).eq('id', after_sales_id);

  return NextResponse.json({ ok: true, order_id: result.order_id });
}
