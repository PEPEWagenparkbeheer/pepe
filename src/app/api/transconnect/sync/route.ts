import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePepe } from '@/lib/apiAuth';
import { getOrderStatus } from '@/lib/transconnect';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/transconnect/sync
// Haalt voor alle importrecords met een TC order-ID de actuele status op en werkt ze bij.
export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { data: records, error } = await supabase
    .from('after_sales')
    .select('id, transport_order_id, transportdatum')
    .eq('type', 'import')
    .eq('gearchiveerd', false)
    .eq('binnen', false)
    .not('transport_order_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!records?.length) return NextResponse.json({ ok: true, updated: 0, skipped: 0 });

  let updated = 0;
  let skipped = 0;
  const fouten: string[] = [];

  await Promise.all(
    records.map(async (rec) => {
      try {
        const order = await getOrderStatus(rec.transport_order_id!);
        if (!order) { skipped++; return; }

        const oo = order as Record<string, unknown>;
        const rawStatus: string = String(oo.order_status ?? oo.status ?? '');
        const status = rawStatus.toLowerCase().replace(/\s+/g, '_');
        const o = order as Record<string, unknown>;
        const geplandeDatum = String(o.planned_arrival_date ?? o.planned_pickup_date ?? o.planned_date ?? '').slice(0, 10) || undefined;
        const aankomstDatum = String(o.arrival_date ?? o.delivery_date ?? o.delivered_date ?? '').slice(0, 10) || undefined;

        const patch: Record<string, unknown> = {
          transport_status: rawStatus || status,
          transport_status_updated_at: new Date().toISOString(),
          aangevraagd: true,
        };

        const isGepland = status.includes('planned') || status.includes('gepland') ||
          status.includes('confirmed') || status.includes('created') || status.includes('uitvoering');
        if (geplandeDatum && isGepland) {
          patch.transportdatum = geplandeDatum.slice(0, 10);
        }

        if (status.includes('delivered') || status.includes('afgeleverd') ||
            status.includes('aangekomen') || aankomstDatum) {
          patch.binnen = true;
          patch.binnen_op = (aankomstDatum ?? new Date().toISOString()).slice(0, 10);
        }

        await supabase.from('after_sales').update(patch).eq('id', rec.id);
        updated++;
      } catch (e) {
        fouten.push(`${rec.transport_order_id}: ${String(e)}`);
        skipped++;
      }
    }),
  );

  return NextResponse.json({ ok: true, updated, skipped, fouten });
}
