// TIJDELIJK — end-to-end ICP-test: maakt buitenlandse debiteur (land+btw) + boekt ICP-factuur.
// GET ?secret=..&vat=FR34445280027&artikel=DIVERSENBL&perftype=services   — VERWIJDEREN na verificatie.
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldFactuur, maakNieuweDebiteur, ARTIKELEN } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!SECRETS.length || !SECRETS.includes(url.searchParams.get('secret') ?? '')) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  const vat = url.searchParams.get('vat') || 'FR34445280027';
  const artikel = (url.searchParams.get('artikel') || 'DIVERSENBL').toUpperCase();
  const perftype = (url.searchParams.get('perftype') || 'services') as 'goods' | 'services';
  const def = ARTIKELEN[artikel];
  if (!def) return NextResponse.json({ error: `Onbekend artikel: ${artikel}` }, { status: 400 });

  let debiteur: string;
  try {
    debiteur = await maakNieuweDebiteur(`TEST ICP ${vat.slice(0, 2)}`, null, {
      vatnumber: vat, land: vat.slice(0, 2).toUpperCase(), adres: 'Rue de Test 1', postcode: '75001', plaats: 'Paris',
    });
  } catch (e) {
    return NextResponse.json({ stap: 'debiteur aanmaken', error: String(e) }, { status: 502 });
  }

  const res = await createTwinfieldFactuur({
    debiteurCode: debiteur,
    regels: [{ omschrijving: `TEST ICP ${artikel}`, aantal: 1, prijs_excl: 100, btw_code: 'geen', grootboek: def.grootboek, article: artikel }],
    status: 'concept', factuurdatum: new Date(), betaaltermijnDagen: 14,
    performance: { type: perftype, country: vat.slice(0, 2).toUpperCase(), vatnumber: vat },
  });
  return NextResponse.json({ debiteur, artikel, perftype, ...res });
}
