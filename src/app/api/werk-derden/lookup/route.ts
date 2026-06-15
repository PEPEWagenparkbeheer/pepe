// GET /api/werk-derden/lookup?kenteken=...
// Proxyt de HubSpot-zoekopdracht zodat HUBSPOT_TOKEN server-only blijft.
// Geeft terug: { klant?: string, meldcode?: string, hubspot_deal_id?: string }

import { NextRequest, NextResponse } from 'next/server';
import { searchDealByKenteken, getInkoopNawByKenteken } from '@/lib/hubspot';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const kenteken = req.nextUrl.searchParams.get('kenteken')?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
  if (!kenteken) {
    return NextResponse.json({ error: 'kenteken vereist' }, { status: 400 });
  }

  try {
    const [dealId, naw] = await Promise.all([
      searchDealByKenteken(kenteken).catch(() => null),
      getInkoopNawByKenteken(kenteken).catch(() => null),
    ]);

    return NextResponse.json({
      klant: naw?.naam ?? null,
      hubspot_deal_id: dealId ?? null,
    });
  } catch (e) {
    console.error('werk-derden/lookup fout:', e);
    return NextResponse.json({ klant: null, hubspot_deal_id: null });
  }
}
