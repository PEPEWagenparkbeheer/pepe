import { NextRequest, NextResponse } from 'next/server';
import { getEnvelopeStatus } from '@/lib/consignatie-docusign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/consignatie/docusign/status?envelopeId=...
// Geeft de actuele status van een envelope terug (sent | delivered | completed | …).
export async function GET(req: NextRequest) {
  const envelopeId = req.nextUrl.searchParams.get('envelopeId')?.trim();
  if (!envelopeId) {
    return NextResponse.json({ error: 'envelopeId ontbreekt.' }, { status: 400 });
  }
  try {
    const status = await getEnvelopeStatus(envelopeId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    console.error('[consignatie/docusign/status] fout:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
