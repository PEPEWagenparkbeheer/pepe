// POST /api/brein/sync
// Haalt mail op uit Outlook (alle geconfigureerde mailboxen) → Supabase.
// Auth via ?secret= query parameter. Aanroepen: BREIN UI (knop) of /api/brein/cron.

import { NextRequest, NextResponse } from 'next/server';
import { runBreinSync } from '@/lib/brein/sync';

export const runtime = 'nodejs';

const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!BREIN_SYNC_SECRET || secret !== BREIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runBreinSync();
    const synced = results.reduce((a, r) => a + r.synced, 0);
    const skipped = results.reduce((a, r) => a + r.skipped, 0);
    return NextResponse.json({ synced, skipped, mailboxes: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brein/sync] Fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
