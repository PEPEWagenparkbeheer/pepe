import { NextRequest, NextResponse } from 'next/server';
import { getInkoopNawByKenteken } from '@/lib/hubspot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/consignatie/hubspot?kenteken=AB123C
// Zoekt de auto in HubSpot en geeft NAW-gegevens van de verkoper terug.
export async function GET(req: NextRequest) {
  const kenteken = req.nextUrl.searchParams.get('kenteken')?.trim();
  if (!kenteken) {
    return NextResponse.json({ gevonden: false, error: 'Kenteken ontbreekt.' }, { status: 400 });
  }
  try {
    const naw = await getInkoopNawByKenteken(kenteken);
    return NextResponse.json(naw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    console.error('[consignatie/hubspot] fout:', message);
    return NextResponse.json({ gevonden: false, error: message }, { status: 500 });
  }
}
