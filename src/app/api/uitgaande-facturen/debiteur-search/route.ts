// GET /api/uitgaande-facturen/debiteur-search?q=  — live Twinfield-debiteuren zoeken (autocomplete)
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { finderSearch } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ resultaten: [] });
  try {
    const items = await finderSearch('DEB', q, 25);
    return NextResponse.json({ resultaten: items.map((i) => ({ code: i.code, naam: i.name })) });
  } catch (e) {
    return NextResponse.json({ error: String(e), resultaten: [] }, { status: 502 });
  }
}
