// POST /api/uitgaande-facturen/docusign-import  — Body: { envelopeId }
// Handmatig een getekende DocuSign-offerte ophalen en als auto-order (status 'aanvullen') klaarzetten.
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { importeerAutoUitEnvelope } from '@/lib/factuur/docusign-import';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { envelopeId } = await req.json().catch(() => ({}));
  if (!envelopeId) return NextResponse.json({ error: 'envelopeId vereist' }, { status: 400 });

  const res = await importeerAutoUitEnvelope(String(envelopeId));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  if (res.genegeerd) return NextResponse.json({ error: res.error ?? 'Geen verkoop-offerte' }, { status: 422 });
  return NextResponse.json({ ok: true, id: res.id, bestond: res.bestond ?? false });
}
