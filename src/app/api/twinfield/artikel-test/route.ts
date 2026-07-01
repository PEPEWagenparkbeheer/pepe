// TIJDELIJK — VERWIJDEREN na verificatie.
//   ?secret=..&deb=CODE   → debiteur uitlezen
//   ?secret=..&finder=Q   → debiteur zoeken
//   ?secret=..&icp=1&vat=DE860812145 → nieuwe DE-debiteur (btw in field4) + ICP-factuur boeken
import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/twinfield/auth';
import { callProcessXml, finderSearch } from '@/lib/twinfield/soap';
import { createTwinfieldFactuur, maakNieuweDebiteur, ARTIKELEN } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!SECRETS.length || !SECRETS.includes(url.searchParams.get('secret') ?? '')) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  const deb = url.searchParams.get('deb');
  const finder = url.searchParams.get('finder');
  const icp = url.searchParams.get('icp');

  if (finder) return NextResponse.json({ resultaten: await finderSearch('DEB', finder, 25) });

  if (deb) {
    const token = await getValidAccessToken();
    const office = token.companyCode ?? '';
    const resp = await callProcessXml(`<read><type>dimensions</type><office>${office}</office><code>${deb}</code><dimtype>DEB</dimtype></read>`, office);
    return new NextResponse(resp, { headers: { 'Content-Type': 'text/xml' } });
  }

  if (icp) {
    const vat = url.searchParams.get('vat') || 'DE860812145';
    const artikel = (url.searchParams.get('artikel') || 'DIVERSENBL').toUpperCase();
    const def = ARTIKELEN[artikel];
    const debiteur = await maakNieuweDebiteur(`TEST ICP ${vat.slice(0, 2)}`, null, {
      vatnumber: vat, land: vat.slice(0, 2).toUpperCase(), adres: 'Teststrasse 1', postcode: '10115', plaats: 'Berlin',
    });
    const res = await createTwinfieldFactuur({
      debiteurCode: debiteur,
      regels: [{ omschrijving: `TEST ICP ${artikel}`, aantal: 1, prijs_excl: 100, btw_code: 'geen', grootboek: def.grootboek, article: artikel }],
      status: 'concept', factuurdatum: new Date(), betaaltermijnDagen: 14,
      performance: { type: 'services', country: vat.slice(0, 2).toUpperCase(), vatnumber: vat },
    });
    return NextResponse.json({ debiteur, artikel, ...res });
  }

  return NextResponse.json({ error: 'deb | finder | icp vereist' }, { status: 400 });
}
