// Generieke Twinfield-verkoopfactuur-engine voor de uitgaande facturen-module.
// Aanvulling op invoices.ts (werk-derden); die blijft ongewijzigd werken.
//
// Verschil met createSalesInvoice (werk-derden):
//  - regels met aantal + vatcode + grootboek PER regel
//  - status concept | final  (final = definitief → Twinfield kent factuurnummer toe)
//  - creditnota-ondersteuning (negatieve bedragen)
//
// LET OP — vóór go-live met boekhouder bevestigen:
//  - grootboekrekeningen per type (GROOTBOEK hieronder zijn placeholders behalve werk_derden)
//  - de Twinfield-vatcode voor de margeregeling (MARGE_VATCODE)

import { callProcessXml, finderSearch } from './soap';
import { getCompanyFields, updateCompany } from '../hubspot';
import type { BtwCode, FactuurRegel, FactuurType } from '@/types/factuur';

const DEBITEUR_REGEX = /^1\d{4}$/;
const DEBITEUR_START = 10001;
const HS_PROP = 'twinfield_debiteur_code';

// Twinfield-vatcodes. VH=21%, VN=0%. Marge = margeregeling-code (BEVESTIGEN met boekhouder).
const MARGE_VATCODE = process.env.TWINFIELD_MARGE_VATCODE || 'VM';
export const VATCODE: Record<BtwCode, string> = {
  hoog: 'VH',
  geen: 'VN',
  marge: MARGE_VATCODE,
};

// Grootboekrekeningen (dim1) per type. 8054 = doorbelasting (werk-derden, bestaand/bewezen).
// De overige zijn PLACEHOLDERS — bevestigen met boekhouder voordat productiefacturen draaien.
export const GROOTBOEK: Record<FactuurType, string> = {
  werk_derden: '8054',
  auto: '8000',            // TODO bevestigen: omzet auto's
  wagenparkbeheer: '8010', // TODO bevestigen: omzet wagenparkbeheer-fee
  shortlease: '8020',      // TODO bevestigen: omzet shortlease-doorbelasting
  diensten_overig: '8054',
};

export interface TwinfieldFactuurRegelInput {
  omschrijving: string;
  aantal: number;
  prijs_excl: number;
  btw_code: BtwCode;
  grootboek: string;
}

export interface CreateFactuurParams {
  debiteurCode: string;
  regels: TwinfieldFactuurRegelInput[];
  status: 'concept' | 'final';
  factuurdatum?: Date;
  betaaltermijnDagen?: number;
  headertext?: string;
  credit?: boolean;
}

export interface CreateFactuurResult {
  ok: boolean;
  invoice_id?: string;
  error?: string;
}

/**
 * Zoek of maak een Twinfield-debiteur op basis van een HubSpot company-id (i.p.v. deal-id).
 * Gebruikt het bestaande formaat 1XXXX en schrijft de code terug naar HubSpot.
 */
export async function findOrCreateDebtorByCompany(
  companyId: string | null | undefined,
  klantNaam: string,
): Promise<string> {
  let naamVoorZoeken = klantNaam;

  if (companyId) {
    try {
      const fields = await getCompanyFields(companyId, ['name', HS_PROP]);
      if (fields?.[HS_PROP]) return fields[HS_PROP] as string;
      if (fields?.name) naamVoorZoeken = fields.name as string;
    } catch {
      // niet fataal
    }
  }

  const items = await finderSearch('DEB', '*', 500);
  const gevonden = items.find(
    (i) => i.name.trim().toLowerCase() === naamVoorZoeken.trim().toLowerCase(),
  );
  if (gevonden) {
    if (companyId) void writeDebiteurNaarHubSpot(companyId, gevonden.code);
    return gevonden.code;
  }

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
    <name>${escapeXml(naamVoorZoeken)}</name>
    <shortname>${escapeXml(naamVoorZoeken.slice(0, 20))}</shortname>
  </dimension>
</dimensions>`.trim();

  const response = await callProcessXml(xml);
  if (!response.includes('result="1"') && !response.includes("result='1'")) {
    throw new Error(`Debiteur aanmaken mislukt: ${response.slice(0, 300)}`);
  }
  if (companyId) void writeDebiteurNaarHubSpot(companyId, code);
  return code;
}

async function writeDebiteurNaarHubSpot(companyId: string, code: string): Promise<void> {
  try {
    await updateCompany(companyId, { [HS_PROP]: code } as never);
  } catch {
    // niet fataal
  }
}

/**
 * Maakt een Twinfield-verkoopfactuur (concept of definitief). Bij status 'final' kent
 * Twinfield het definitieve factuurnummer toe; dat geven we terug als invoice_id.
 */
export async function createTwinfieldFactuur(
  params: CreateFactuurParams,
): Promise<CreateFactuurResult> {
  const datum = params.factuurdatum ?? new Date();
  const vervaldatum = addDays(datum, params.betaaltermijnDagen ?? 14);
  const sign = params.credit ? -1 : 1;

  const regelsXml = params.regels
    .map(
      (r, i) => `
    <line id="${i + 1}">
      <article>0</article>
      <quantity>${r.aantal}</quantity>
      <units>1</units>
      <unitspriceexcl>${(sign * r.prijs_excl).toFixed(2)}</unitspriceexcl>
      <vatcode>${VATCODE[r.btw_code]}</vatcode>
      <description>${escapeXml(r.omschrijving)}</description>
      <dim1>${r.grootboek}</dim1>
    </line>`,
    )
    .join('');

  const xml = `
<salesinvoice>
  <header>
    <invoicetype>FACTUUR</invoicetype>
    <status>${params.status}</status>
    <customer>
      <code>${params.debiteurCode}</code>
    </customer>
    <currency>EUR</currency>
    <invoicedate>${toDateString(datum)}</invoicedate>
    <duedate>${toDateString(vervaldatum)}</duedate>
    <headertext>${escapeXml(params.headertext ?? '')}</headertext>
  </header>
  <lines>${regelsXml}
  </lines>
</salesinvoice>`.trim();

  const response = await callProcessXml(xml);
  const isSuccess = response.includes('result="1"') || response.includes("result='1'");
  if (!isSuccess) {
    return { ok: false, error: `Twinfield: ${response.slice(0, 400)}` };
  }
  const invoicenumber = extractXmlTag(response, 'invoicenumber');
  return { ok: true, invoice_id: invoicenumber ?? undefined };
}

// ── kleine XML-helpers (lokaal, spiegelt invoices.ts) ───────────────────────
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function toDateString(d: Date): string {
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
