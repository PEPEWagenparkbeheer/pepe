import { callProcessXml, finderSearch } from './soap';
import type { TwinfieldFactuurInput, TwinfieldFactuurResult } from '../twinfield';

const DEBITEUR_REGEX = /^1\d{4}$/;
const DEBITEUR_START = 10001;

export async function findOrCreateDebtor(klant: string): Promise<string> {
  const items = await finderSearch('DEB', '*', 200);

  // Zoek op exacte naam (case-insensitive)
  const gevonden = items.find(
    (i) => i.name.trim().toLowerCase() === klant.trim().toLowerCase(),
  );
  if (gevonden) return gevonden.code;

  // Bepaal volgend vrij nummer (formaat 1XXXX)
  const nummers = items
    .map((i) => i.code)
    .filter((c) => DEBITEUR_REGEX.test(c))
    .map(Number);
  const volgend = nummers.length ? Math.max(...nummers) + 1 : DEBITEUR_START;
  const code = String(volgend);

  const xml = `
<dimensions>
  <dimension>
    <type>DEB</type>
    <code>${code}</code>
    <name>${escapeXml(klant)}</name>
    <shortname>${escapeXml(klant.slice(0, 20))}</shortname>
  </dimension>
</dimensions>`.trim();

  const response = await callProcessXml(xml);
  if (!response.includes('result="1"') && !response.includes("result='1'")) {
    throw new Error(`Debiteur aanmaken mislukt: ${response.slice(0, 300)}`);
  }
  return code;
}

export async function createSalesInvoice(
  input: TwinfieldFactuurInput,
  debiteurCode: string,
): Promise<TwinfieldFactuurResult> {
  const vandaag = toDateString(new Date());
  const vervaldatum = toDateString(addDays(new Date(), 30));
  const vatCode = input.btw_pct === 21 ? 'VH' : 'VN';
  const headerText = `Doorbelasting partnerkosten ${input.kenteken}`.trim();

  const regelsXml = input.regels
    .map(
      (r, i) => `
    <line id="${i + 1}">
      <quantity>1</quantity>
      <unitspriceexcl>${r.bedrag.toFixed(2)}</unitspriceexcl>
      <vatcode>${vatCode}</vatcode>
      <description>${escapeXml(r.omschrijving)}</description>
      <dim1>8054</dim1>
    </line>`,
    )
    .join('');

  const xml = `
<salesinvoice>
  <header>
    <invoicetype>FACTUUR</invoicetype>
    <status>concept</status>
    <customer>
      <code>${debiteurCode}</code>
    </customer>
    <currency>EUR</currency>
    <invoicedate>${vandaag}</invoicedate>
    <duedate>${vervaldatum}</duedate>
    <headertext>${escapeXml(headerText)}</headertext>
  </header>
  <lines>${regelsXml}
  </lines>
</salesinvoice>`.trim();

  const response = await callProcessXml(xml);

  const isSuccess =
    response.includes('result="1"') || response.includes("result='1'");
  if (!isSuccess) {
    const msg = extractXmlAttr(response, 'msg') ?? response.slice(0, 300);
    return { ok: false, error: `Twinfield: ${msg}` };
  }

  const invoicenumber = extractXmlTag(response, 'invoicenumber');
  return { ok: true, invoice_id: invoicenumber ?? 'onbekend' };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1];
}

function extractXmlAttr(xml: string, attr: string): string | undefined {
  const m = xml.match(new RegExp(`${attr}="([^"]*)"`));
  return m?.[1];
}
