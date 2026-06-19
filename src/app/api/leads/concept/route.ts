// POST /api/leads/concept — genereert een concept-antwoord op een lead.
// Auth: ingelogde PEPE-gebruiker. Body = leadgegevens. Retourneert { body, inruil }.

import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { genereerLeadConcept } from '@/lib/leads/concept';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const b = await req.json();
    if (!b?.auto) return NextResponse.json({ error: 'auto ontbreekt' }, { status: 400 });
    const concept = await genereerLeadConcept({
      klant_naam: b.klant_naam ?? '',
      auto: b.auto,
      prijs: b.prijs ?? null,
      advertentie_url: b.advertentie_url ?? null,
      bericht: b.bericht ?? null,
      bron: b.bron ?? null,
    });
    return NextResponse.json({ ok: true, ...concept });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads/concept] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
