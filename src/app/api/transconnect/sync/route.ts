import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePepe } from '@/lib/apiAuth';
import { getOrderStatus, mapTcOrderToPatch } from '@/lib/transconnect';
import { syncAfterSalesNaarFactuur } from '@/lib/factuur/import-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

function geautoriseerd(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  const secret = new URL(req.url).searchParams.get('secret');
  return (
    (!!CRON_SECRET && secret === CRON_SECRET) ||
    (!!BREIN_SYNC_SECRET && secret === BREIN_SYNC_SECRET)
  );
}

async function runSync() {
  // Sync alle niet-gearchiveerde records met een TC order-ID.
  // binnen=true records worden ook gesync om de definitieve TC-status op te halen;
  // mapTcOrderToPatch overschrijft binnen nooit met false.
  const { data: records, error } = await supabase
    .from('after_sales')
    .select('id, transport_order_id, transportdatum')
    .eq('type', 'import')
    .eq('gearchiveerd', false)
    .not('transport_order_id', 'is', null);

  if (error) return { status: 500, body: { error: error.message } };
  if (!records?.length) return { status: 200, body: { ok: true, updated: 0, skipped: 0 } };

  let updated = 0;
  let skipped = 0;
  const fouten: string[] = [];

  await Promise.all(
    records.map(async (rec) => {
      try {
        const order = await getOrderStatus(rec.transport_order_id!);
        if (!order) { skipped++; return; }

        const patch = mapTcOrderToPatch(order as Record<string, unknown>);
        await supabase.from('after_sales').update(patch).eq('id', rec.id);
        // Laat de gekoppelde pijplijn-factuur meebewegen met transport-updates (no-op zonder koppeling).
        await syncAfterSalesNaarFactuur(rec.id);
        updated++;
      } catch (e) {
        fouten.push(`${rec.transport_order_id}: ${String(e)}`);
        skipped++;
      }
    }),
  );

  return { status: 200, body: { ok: true, updated, skipped, fouten } };
}

// GET /api/transconnect/sync — Vercel Cron (meerdere keren per dag).
// Auth via Authorization: Bearer <CRON_SECRET> of ?secret=<CRON_SECRET>.
export async function GET(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { status, body } = await runSync();
  return NextResponse.json(body, { status });
}

// POST /api/transconnect/sync — Handmatig via PEPE-sessie.
export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { status, body } = await runSync();
  return NextResponse.json(body, { status });
}
