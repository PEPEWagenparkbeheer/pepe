// TIJDELIJK — GET /api/twinfield/artikel-test?secret=..&debiteur=1238[&artikel=BPM | &auto=1]
//   artikel=CODE → boekt 1 concept-regel op dat artikel.
//   auto=1       → boekt een complete BTW-auto: levering (BTWAUTO) + BPM-regel.
// Verifieert artikelcode-boeking tegen test-admin 202500005. VERWIJDEREN na verificatie.
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldFactuur, ARTIKELEN, type TwinfieldFactuurRegelInput } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const s = url.searchParams.get('secret') ?? '';
  if (!SECRETS.length || !SECRETS.includes(s)) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  const debiteur = url.searchParams.get('debiteur');
  if (!debiteur) return NextResponse.json({ error: 'debiteur vereist' }, { status: 400 });

  let regels: TwinfieldFactuurRegelInput[];
  if (url.searchParams.get('auto') === '1') {
    regels = [
      { omschrijving: 'Levering test-auto', aantal: 1, prijs_excl: 10000, btw_code: 'hoog', grootboek: ARTIKELEN.BTWAUTO.grootboek, article: 'BTWAUTO' },
      { omschrijving: 'BPM', aantal: 1, prijs_excl: 2000, btw_code: 'geen', grootboek: ARTIKELEN.BPM.grootboek, article: 'BPM' },
    ];
  } else {
    const artikel = (url.searchParams.get('artikel') || 'BPM').toUpperCase();
    const def = ARTIKELEN[artikel];
    if (!def) return NextResponse.json({ error: `Onbekend artikel: ${artikel}`, bekend: Object.keys(ARTIKELEN) }, { status: 400 });
    regels = [{ omschrijving: `TEST ${artikel}`, aantal: 1, prijs_excl: 1, btw_code: 'hoog', grootboek: def.grootboek, article: artikel }];
  }

  const res = await createTwinfieldFactuur({
    debiteurCode: String(debiteur), regels, status: 'concept', factuurdatum: new Date(), betaaltermijnDagen: 14,
  });
  return NextResponse.json({ regels: regels.map(r => r.article), ...res });
}
