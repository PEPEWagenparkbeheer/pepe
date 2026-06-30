// TIJDELIJK — ICP-debug. ?secret=..&read=1302 toont ruwe debiteur-XML; anders e2e ICP-test.
import { NextRequest, NextResponse } from 'next/server';
import { createTwinfieldFactuur, maakNieuweDebiteur, ARTIKELEN } from '@/lib/twinfield/factuur';
import { getValidAccessToken } from '@/lib/twinfield/auth';
import { callProcessXml } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!SECRETS.length || !SECRETS.includes(url.searchParams.get('secret') ?? '')) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const read = url.searchParams.get('read');
  if (read) {
    const token = await getValidAccessToken();
    const office = token.companyCode ?? '';
    const xml = `<read><type>dimensions</type><office>${office}</office><code>${read}</code><dimtype>DEB</dimtype></read>`;
    const resp = await callProcessXml(xml, office);
    return new NextResponse(resp, { headers: { 'Content-Type': 'text/xml' } });
  }

  const vat = url.searchParams.get('vat') || 'FR34445280027';
  const artikel = (url.searchParams.get('artikel') || 'DIVERSENBL').toUpperCase();
  const perftype = (url.searchParams.get('perftype') || 'services') as 'goods' | 'services';
  const def = ARTIKELEN[artikel];
  if (!def) return NextResponse.json({ error: `Onbekend artikel: ${artikel}` }, { status: 400 });
  const bestaand = url.searchParams.get('book'); // boek op bestaande debiteur (aparte request)
  const debiteur = bestaand ?? await maakNieuweDebiteur(`TEST ICP ${vat.slice(0, 2)}`, null, {
    vatnumber: vat, land: vat.slice(0, 2).toUpperCase(), adres: 'Rue de Test 1', postcode: '75001', plaats: 'Paris',
  });
  const res = await createTwinfieldFactuur({
    debiteurCode: debiteur,
    regels: [{ omschrijving: `TEST ICP ${artikel}`, aantal: 1, prijs_excl: 100, btw_code: 'geen', grootboek: def.grootboek, article: artikel }],
    status: 'concept', factuurdatum: new Date(), betaaltermijnDagen: 14,
    performance: { type: perftype, country: vat.slice(0, 2).toUpperCase(), vatnumber: vat },
  });
  return NextResponse.json({ debiteur, artikel, perftype, ...res });
}
