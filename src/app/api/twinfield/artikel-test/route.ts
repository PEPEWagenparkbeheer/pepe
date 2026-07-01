// TIJDELIJK — read-only diagnose. VERWIJDEREN na analyse.
//   ?secret=..&deb=CODE       → debiteur (DEB dimension)
//   ?secret=..&raw=<base64>   → willekeurige read/browse-XML (read-only)
import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/twinfield/auth';
import { callProcessXml, finderSearch } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';
const SECRETS = [process.env.CRON_SECRET, process.env.ARTIKEL_TEST_SECRET].filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!SECRETS.length || !SECRETS.includes(url.searchParams.get('secret') ?? '')) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  const token = await getValidAccessToken();
  const office = token.companyCode ?? '';
  const deb = url.searchParams.get('deb');
  const raw = url.searchParams.get('raw');
  const finder = url.searchParams.get('finder');
  if (finder) {
    const items = await finderSearch('DEB', finder, 25);
    return NextResponse.json({ resultaten: items });
  }
  let xml = '';
  if (deb) {
    xml = `<read><type>dimensions</type><office>${office}</office><code>${deb}</code><dimtype>DEB</dimtype></read>`;
  } else if (raw) {
    xml = Buffer.from(raw, 'base64').toString('utf8').replace(/\{office\}/g, office);
    if (!/^<(read|columns|list)\b/i.test(xml.trim())) {
      return NextResponse.json({ error: 'alleen read/browse toegestaan' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'deb | raw vereist' }, { status: 400 });
  }
  const resp = await callProcessXml(xml, office);
  return new NextResponse(resp, { headers: { 'Content-Type': 'text/xml' } });
}
