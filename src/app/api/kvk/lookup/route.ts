// GET /api/kvk/lookup?kvk=12345678
// Haalt basisprofiel op uit het KVK Handelsregister.
// Vereist KVK_API_KEY in .env.local.

import { NextRequest, NextResponse } from 'next/server';
import { kvkOpzoeken } from '@/lib/kvk';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const kvk = req.nextUrl.searchParams.get('kvk')?.replace(/\D/g, '') ?? '';
  if (kvk.length !== 8) {
    return NextResponse.json({ error: 'Ongeldig KVK-nummer (8 cijfers verwacht)' }, { status: 400 });
  }

  const bedrijf = await kvkOpzoeken(kvk);
  if (!bedrijf) {
    return NextResponse.json({ gevonden: false }, { status: 404 });
  }

  return NextResponse.json({ gevonden: true, ...bedrijf });
}
