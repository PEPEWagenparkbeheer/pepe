// TIJDELIJK — read-only diagnose. VERWIJDEREN na analyse.
//   ?secret=..&deb=CODE                 → debiteur (DEB dimension)
//   ?secret=..&inv=21                    → salesinvoice (concept)
//   ?secret=..&tx=VRK&nr=21              → transactie (geboekte factuur in dagboek)
import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/twinfield/auth';
import { callProcessXml } from '@/lib/twinfield/soap';

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
  const inv = url.searchParams.get('inv');
  const tx = url.searchParams.get('tx');
  const nr = url.searchParams.get('nr');
  let xml = '';
  if (deb) {
    xml = `<read><type>dimensions</type><office>${office}</office><code>${deb}</code><dimtype>DEB</dimtype></read>`;
  } else if (tx && nr) {
    xml = `<read><type>transaction</type><office>${office}</office><code>${tx}</code><number>${nr}</number></read>`;
  } else if (inv) {
    xml = `<read><type>salesinvoice</type><office>${office}</office><invoicetype>FACTUUR</invoicetype><invoicenumber>${inv}</invoicenumber></read>`;
  } else {
    return NextResponse.json({ error: 'deb | inv | tx+nr vereist' }, { status: 400 });
  }
  const resp = await callProcessXml(xml, office);
  return new NextResponse(resp, { headers: { 'Content-Type': 'text/xml' } });
}
