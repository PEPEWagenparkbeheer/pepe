// POST /api/brein/eval  (DEV/TEST)
// Genereert een concept voor een INLINE scenario (zonder DB), voor batch-testen
// van de beslislogica. Auth: ?secret=BREIN_SYNC_SECRET
// Body: { onderwerp, body, categorie?, afzenderEmail?, kenteken? }

import { NextRequest, NextResponse } from 'next/server';
import { genereerConcept } from '@/lib/brein/concept';
import { PEPE_PROCEDURES } from '@/lib/brein/kennis';
import { buildBreinContext } from '@/lib/brein/context';

export const runtime = 'nodejs';
const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== BREIN_SYNC_SECRET || !BREIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = (await req.json()) as {
    onderwerp?: string; body?: string; categorie?: string;
    afzenderEmail?: string; kenteken?: string;
  };

  const contextDelen = await buildBreinContext({
    afzenderEmail: s.afzenderEmail ?? null,
    kenteken: s.kenteken ?? null,
  });

  try {
    const concept = await genereerConcept({
      onderwerp: s.onderwerp ?? null,
      afzenderNaam: null,
      afzenderEmail: s.afzenderEmail ?? null,
      categorie: s.categorie ?? null,
      body: s.body ?? '',
      stijlvoorbeelden: [], // eval test de INHOUD/het proces, niet de toon
      context: contextDelen.join('\n') || undefined,
      procedures: PEPE_PROCEDURES,
    });
    return NextResponse.json({ concept, context: contextDelen });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
