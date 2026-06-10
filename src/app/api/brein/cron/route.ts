// GET /api/brein/cron
// Automatisch ophalen van nieuwe mail (alle mailboxen) — aangeroepen door Vercel Cron.
// Auth: Vercel stuurt 'Authorization: Bearer <CRON_SECRET>'. Handmatig testen kan
// ook met ?secret=<BREIN_SYNC_SECRET>.

import { NextRequest, NextResponse } from 'next/server';
import { runBreinSync } from '@/lib/brein/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

function geautoriseerd(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  const secret = req.nextUrl.searchParams.get('secret');
  if (BREIN_SYNC_SECRET && secret === BREIN_SYNC_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runBreinSync();
    const synced = results.reduce((a, r) => a + r.synced, 0);
    console.log(`[brein/cron] ${synced} nieuwe mail(s) over ${results.length} mailbox(en)`);
    return NextResponse.json({ ok: true, synced, mailboxes: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brein/cron] Fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
