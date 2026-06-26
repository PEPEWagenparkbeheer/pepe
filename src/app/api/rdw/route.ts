// GET /api/rdw?kenteken=XX123X
// Proxy naar RDW OpenData (kent geen CORS naar browser). Retourneert voertuig- + brandstofdata.
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const kenteken = (new URL(req.url).searchParams.get('kenteken') ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!kenteken) return NextResponse.json({ error: 'kenteken vereist' }, { status: 400 });

  const [voertuigRes, brandstofRes] = await Promise.all([
    fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${kenteken}`),
    fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${kenteken}`),
  ]);

  if (!voertuigRes.ok) return NextResponse.json({ error: 'RDW onbereikbaar' }, { status: 502 });

  const [voertuig, brandstof] = await Promise.all([voertuigRes.json(), brandstofRes.json()]);
  const v = Array.isArray(voertuig) ? voertuig[0] : null;
  const b = Array.isArray(brandstof) ? brandstof[0] : null;

  if (!v) return NextResponse.json({ gevonden: false });

  return NextResponse.json({
    gevonden: true,
    kenteken: v.kenteken ?? kenteken,
    merk: v.merk ?? null,
    model: v.handelsbenaming ?? null,
    kleur: v.eerste_kleur ?? null,
    datum_deel1a: v.datum_eerste_toelating
      ? `${v.datum_eerste_toelating.slice(0, 4)}-${v.datum_eerste_toelating.slice(4, 6)}-${v.datum_eerste_toelating.slice(6, 8)}`
      : null,
    brandstof: b?.brandstof_omschrijving ?? null,
  });
}
