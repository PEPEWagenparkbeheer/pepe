// GET /api/werk-derden/lookup?kenteken=...
// Combineert HubSpot (klant/dealId) + RDW (merk/model) lookup.

import { NextRequest, NextResponse } from 'next/server';
import { searchDealByKenteken, getInkoopNawByKenteken } from '@/lib/hubspot';
import { rdwOpzoeken } from '@/lib/rdw';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const kenteken = req.nextUrl.searchParams.get('kenteken')?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
  if (!kenteken) {
    return NextResponse.json({ error: 'kenteken vereist' }, { status: 400 });
  }

  try {
    const [dealId, naw, rdw] = await Promise.all([
      searchDealByKenteken(kenteken).catch(() => null),
      getInkoopNawByKenteken(kenteken).catch(() => null),
      rdwOpzoeken(kenteken).catch(() => null),
    ]);

    return NextResponse.json({
      klant: naw?.naam ?? null,
      hubspot_deal_id: dealId ?? null,
      merk: rdw?.voertuig?.merk ?? null,
      model: rdw?.voertuig?.handelsbenaming ?? null,
    });
  } catch (e) {
    console.error('werk-derden/lookup fout:', e);
    return NextResponse.json({ klant: null, hubspot_deal_id: null, merk: null, model: null });
  }
}
