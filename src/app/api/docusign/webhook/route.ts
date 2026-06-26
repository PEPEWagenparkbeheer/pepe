// POST /api/docusign/webhook — DocuSign Connect (envelope completed) → auto-order klaarzetten.
//
// Connect instellen (DocuSign admin, eenmalig): listener-URL = deze route met ?secret=<DOCUSIGN_WEBHOOK_SECRET>,
// trigger op "Envelope Completed". Ondersteunt zowel Connect JSON (aggregate) als de klassieke XML-payload.
import { NextRequest, NextResponse } from 'next/server';
import { importeerAutoUitEnvelope } from '@/lib/factuur/docusign-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET = process.env.DOCUSIGN_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (SECRET) {
    const q = new URL(req.url).searchParams.get('secret');
    const hdr = req.headers.get('x-docusign-secret');
    if (q !== SECRET && hdr !== SECRET) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }
  }

  const raw = await req.text();
  let envelopeId = '';
  let status = '';

  // 1) JSON (Connect 2.0 aggregate)
  try {
    const j = JSON.parse(raw);
    status = (j.event || j.status || j.data?.envelopeSummary?.status || '').toString().toLowerCase();
    envelopeId = (j.data?.envelopeId || j.envelopeId || j.data?.envelopeSummary?.envelopeId || '').toString();
  } catch {
    // 2) XML (klassieke Connect)
    status = (raw.match(/<Status>([^<]+)<\/Status>/i)?.[1] || '').toLowerCase();
    envelopeId = raw.match(/<EnvelopeId>([^<]+)<\/EnvelopeId>/i)?.[1]
      || raw.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i)?.[1] || '';
  }

  // Alleen op 'completed'/'envelope-completed' verwerken
  if (!/complete/i.test(status)) {
    return NextResponse.json({ ok: true, genegeerd: true, status });
  }
  if (!envelopeId) {
    return NextResponse.json({ ok: true, genegeerd: true, reden: 'geen envelopeId' });
  }

  const res = await importeerAutoUitEnvelope(envelopeId);
  // Altijd 200 terug naar DocuSign (anders blijft Connect retryen); fout loggen in body.
  return NextResponse.json({ ok: res.ok, id: res.id, bestond: res.bestond, error: res.error });
}
