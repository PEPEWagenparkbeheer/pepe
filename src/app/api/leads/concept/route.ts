// POST /api/leads/concept — genereert een concept-antwoord op een lead.
// Auth: ingelogde PEPE-gebruiker. Body = leadgegevens. Retourneert { body, inruil }.

import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { genereerLeadConcept } from '@/lib/leads/concept';
import { isAutoBeschikbaar } from '@/lib/leads/voorraad';
import { laadBreinFeedback } from '@/lib/brein/feedback';
import { extractKentekenRegex } from '@/lib/brein/classifier';
import { rdwVoertuigBasisOpzoeken } from '@/lib/rdw';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const b = await req.json();
    if (!b?.auto) return NextResponse.json({ error: 'auto ontbreekt' }, { status: 400 });

    const kenteken = extractKentekenRegex(b.bericht ?? '');
    const [voorraad, feedbackLessen, inruilVoertuig] = await Promise.all([
      isAutoBeschikbaar(b.auto),
      laadBreinFeedback('leads'),
      kenteken ? rdwVoertuigBasisOpzoeken(kenteken) : Promise.resolve(null),
    ]);

    const concept = await genereerLeadConcept({
      klant_naam: b.klant_naam ?? '',
      auto: b.auto,
      prijs: b.prijs ?? null,
      advertentie_url: b.advertentie_url ?? null,
      bericht: b.bericht ?? null,
      bron: b.bron ?? null,
      beschikbaar: voorraad.beschikbaar,
      feedbackLessen,
      inruilVoertuig,
      klantReacties: Array.isArray(b.klant_reacties) ? b.klant_reacties : [],
    });
    return NextResponse.json({ ok: true, ...concept, beschikbaar: voorraad.beschikbaar, inruilVoertuig });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads/concept] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
