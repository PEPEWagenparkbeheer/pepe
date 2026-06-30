// TIJDELIJK — ICP-test. GET ?secret=..&debiteur=1238&artikel=DIVERSENBL&perftype=services&vat=FR34445280027
// Verifieert ICP-boeking (performance-velden op de regel). VERWIJDEREN na verificatie.
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldFactuur, ARTIKELEN } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const s = url.searchParams.get('secret') ?? '';
  if (!SECRETS.length || !SECRETS.includes(s)) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  const debiteur = url.searchParams.get('debiteur');
  if (!debiteur) return NextResponse.json({ error: 'debiteur vereist' }, { status: 400 });
  const artikel = (url.searchParams.get('artikel') || 'DIVERSENBL').toUpperCase();
  const def = ARTIKELEN[artikel];
  if (!def) return NextResponse.json({ error: `Onbekend artikel: ${artikel}` }, { status: 400 });
  const perftype = (url.searchParams.get('perftype') || 'services') as 'goods' | 'services';
  const vat = url.searchParams.get('vat') || 'FR34445280027';

  const res = await createTwinfieldFactuur({
    debiteurCode: String(debiteur),
    regels: [{ omschrijving: `TEST ICP ${artikel}`, aantal: 1, prijs_excl: 100, btw_code: 'geen', grootboek: def.grootboek, article: artikel }],
    status: 'concept', factuurdatum: new Date(), betaaltermijnDagen: 14,
    performance: { type: perftype, country: vat.slice(0, 2).toUpperCase(), vatnumber: vat },
  });
  return NextResponse.json({ artikel, def, perftype, vat, ...res });
}
