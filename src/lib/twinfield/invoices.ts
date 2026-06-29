import { callProcessXml, finderSearch } from './soap';
import { getDealCompanyId, getCompanyFields, updateCompany } from '../hubspot';
import type { TwinfieldFactuurInput, TwinfieldFactuurResult } from '../twinfield';

const DEBITEUR_START = 1000; // fallback als de administratie nog geen numerieke debiteuren heeft
const HS_PROP = 'twinfield_debiteur_code';

// Grootboekrekening voor partner-kostendoorbelasting ("Omzet doorbelasting partnerkosten").
// Voor toekomstige factuurtypes (bijv. voertuigen) hier een eigen rekening toevoegen.
const GROOTBOEK_DOORBELASTING = '8054';

export async function findOrCreateDebtor(
  klant: string,
  hubspotDealId?: string,
): Promise<string> {
  let companyId: string | null = null;
  let naamVoorZoeken = klant;

  // HubSpot ophalen als we een deal-ID hebben
  if (hubspotDealId) {
    try {
      companyId = await getDealCompanyId(hubspotDealId);
      if (companyId) {
        const fields = await getCompanyFields(companyId, ['name', HS_PROP]);
        // Snel pad: code staat al in HubSpot
        if (fields?.[HS_PROP]) return fields[HS_PROP] as string;
        // Gebruik HubSpot-naam als die beschikbaar is
        if (fields?.name) naamVoorZoeken = fields.name as string;
      }
    } catch {
      // HubSpot-fout is niet fataal — ga door met de klant-naam
    }
  }

  // Zoek in Twinfield op naam
  const items = await finderSearch('DEB', '*', 200);
  const gevonden = items.find(
    (i) => i.name.trim().toLowerCase() === naamVoorZoeken.trim().toLowerCase(),
  );

  if (gevonden) {
    // Schrijf code terug naar HubSpot (fire-and-forget)
    if (companyId) void writeDebiteurNaarHubSpot(companyId, gevonden.code);
    return gevonden.code;
  }

  // Nieuw debiteurnummer = hoogste bestaande NUMERIEKE code + 1 (volgt formaat van de administratie).
  const nummers = items
    .map((i) => i.code.trim())
    .filter((c) => /^\d+$/.test(c))
    .map(Number);
  const volgend = nummers.length ? Math.max(...nummers) + 1 : DEBITEUR_START;
  const code = String(volgend);

  const xml = `
<dimensions>
  <dimension>
    <type>DEB</type>
    <code>${code}</code>
    <name>${escapeXml(naamVoorZoeken)}</name>
    <shortname>${escapeXml(naamVoorZoeken.slice(0, 20))}</shortname>
  </dimension>
</dimensions>`.trim();

  const response = await callProcessXml(xml);
  if (!response.includes('result="1"') && !response.includes("result='1'")) {
    throw new Error(`Debiteur aanmaken mislukt: ${response.slice(0, 300)}`);
  }

  // Schrijf code terug naar HubSpot (fire-and-forget)
  if (companyId) void writeDebiteurNaarHubSpot(companyId, code);
  return code;
}

async function writeDebiteurNaarHubSpot(companyId: string, code: string): Promise<void> {
  try {
    await updateCompany(companyId, { [HS_PROP]: code } as never);
  } catch {
    // Niet fataal
  }
}

export async function createSalesInvoice(
  input: TwinfieldFactuurInput,
  debiteurCode: string,
): Promise<TwinfieldFactuurResult> {
  const vandaag = toDateString(new Date());
  const vervaldatum = toDateString(addDays(new Date(), 30));
  const vatCode = input.btw_pct === 21 ? 'VH' : 'VN';
  const headerText = `Doorbelasting partnerkosten ${input.kenteken}`.trim();

  // One-off regel (article 0): altijd beschikbaar in elke administratie, geen
  // artikel-onderhoud nodig. dim1 = grootboekrekening; werkt doordat in de
  // Classic-factuursoort "Kan de grootboekrekening aanpassen" aanstaat.
  // Per factuurtype instelbaar (werk-derden = 8054 doorbelasting; voertuigen later anders).
  const grootboek = GROOTBOEK_DOORBELASTING;
  const regelsXml = input.regels
    .map(
      (r, i) => `
    <line id="${i + 1}">
      <article>0</article>
      <quantity>1</quantity>
      <units>1</units>
      <unitspriceexcl>${r.bedrag.toFixed(2)}</unitspriceexcl>
      <vatcode>${vatCode}</vatcode>
      <description>${escapeXml(r.omschrijving)}</description>
      <dim1>${grootboek}</dim1>
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
  // Twinfield verwacht YYYYMMDD (zonder streepjes)
  return d.toISOString().slice(0, 10).replace(/-/g, '');
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
