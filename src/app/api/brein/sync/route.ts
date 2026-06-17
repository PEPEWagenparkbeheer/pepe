// POST /api/brein/sync
// Haalt mail op uit Outlook (alle geconfigureerde mailboxen) → Supabase.
// Auth via ?secret= query parameter. Aanroepen: BREIN UI (knop) of /api/brein/cron.

import { NextRequest, NextResponse } from 'next/server';
import { runBreinSync } from '@/lib/brein/sync';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

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
