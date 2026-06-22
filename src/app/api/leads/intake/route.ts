// POST /api/leads/intake
// Triggert handmatig runLeadsIntake() — bedoeld voor de "Ververs"-knop in de leads-UI.
// Auth: requirePepe() (ingelogde PEPE-medewerker).

import { NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { runLeadsIntake } from '@/lib/leads/intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const { leads, tenders, skipped } = await runLeadsIntake();
    return NextResponse.json({ ok: true, leads, tenders, skipped });
  } catch (err) {
    console.error('[leads/intake]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
