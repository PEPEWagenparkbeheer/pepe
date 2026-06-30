// TIJDELIJK — GET /api/twinfield/artikel-test?secret=CRON_SECRET&artikel=DIVERSEN&debiteur=1238
// Boekt een CONCEPT-factuur (veilig, geen definitief nummer) met één regel op het gegeven artikel,
// om te verifiëren dat boeken op artikelcode door Twinfield (test-admin 202500005) wordt geaccepteerd.
// VERWIJDEREN na verificatie van de artikelcode-mapping.
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldFactuur, ARTIKELEN } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
const SECRET = process.env.CRON_SECRET ?? '';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!SECRET || url.searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  const artikel = (url.searchParams.get('artikel') || 'DIVERSEN').toUpperCase();
  const debiteur = url.searchParams.get('debiteur');
  if (!debiteur) return NextResponse.json({ error: 'debiteur-parameter vereist' }, { status: 400 });
  const def = ARTIKELEN[artikel];
  if (!def) return NextResponse.json({ error: `Onbekend artikel: ${artikel}`, bekend: Object.keys(ARTIKELEN) }, { status: 400 });

  const res = await createTwinfieldFactuur({
    debiteurCode: String(debiteur),
    regels: [{
      omschrijving: `TEST artikelcode ${artikel}`,
      aantal: 1,
      prijs_excl: 1,
      btw_code: 'hoog',
      grootboek: def.grootboek,
      article: artikel,
    }],
    status: 'concept',
    factuurdatum: new Date(),
    betaaltermijnDagen: 14,
  });
  return NextResponse.json({ artikel, def, ...res });
}
