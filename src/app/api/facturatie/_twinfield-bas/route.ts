// TIJDELIJK diagnose-endpoint: lijst grootboekrekeningen (dimtype BAS) van de actieve administratie.
// Guard: ?secret=CRON_SECRET. Verwijderen na gebruik.
import { NextRequest, NextResponse } from 'next/server';
import { finderSearch } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret') ?? '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'nope' }, { status: 403 });
  }
  try {
    const all = await finderSearch('BAS', '*', 5000);
    const omzet = all.filter((a) => /^8\d{3}$/.test(a.code)).sort((x, y) => x.code.localeCompare(y.code));
    return NextResponse.json({ totaal: all.length, omzet });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
