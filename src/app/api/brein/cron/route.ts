// GET /api/brein/cron
// Automatisch ophalen van nieuwe mail (alle mailboxen) — aangeroepen door Vercel Cron.
// Auth: Vercel stuurt 'Authorization: Bearer <CRON_SECRET>'. Handmatig testen kan
// ook met ?secret=<BREIN_SYNC_SECRET>.

import { NextRequest, NextResponse } from 'next/server';
import { runBreinSync } from '@/lib/brein/sync';
import { runLeadsIntake } from '@/lib/leads/intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

function geautoriseerd(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runBreinSync();
    const synced = results.reduce((a, r) => a + r.synced, 0);
    console.log(`[brein/cron] ${synced} nieuwe mail(s) over ${results.length} mailbox(en)`);

    // Lead-intake uit info@ — fouten hier mogen de berijder-sync niet breken.
    let leads;
    try {
      leads = await runLeadsIntake();
      console.log(
        `[brein/cron] leads-intake: ${leads.leads} lead(s), ${leads.tenders} tender(s), ${leads.skipped} overgeslagen`,
      );
    } catch (e) {
      console.error('[brein/cron] leads-intake fout:', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ ok: true, synced, mailboxes: results, leads });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brein/cron] Fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
