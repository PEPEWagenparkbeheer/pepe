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
import { getValidAccessToken } from './auth';
import { getCompanyFields, updateCompany } from '../hubspot';
import type { BtwCode, FactuurRegel, FactuurType } from '@/types/factuur';
import type { MatchKandidaat } from '@/types/match';

const DEBITEUR_START = 1000; // fallback als de administratie nog geen numerieke debiteuren heeft
const HS_PROP = 'twinfield_debiteur_code';

// Volgend debiteurnummer = hoogste bestaande NUMERIEKE code + 1. Zo volgen we automatisch het
// formaat van de administratie (bv. 4-cijferig 1XXX bij PEPE Wagenparkbeheer) i.p.v. een vaste start.
function volgendDebiteurNummer(items: Array<{ code: string }>): string {
  const nummers = items
    .map((i) => i.code.trim())
    .filter((c) => /^\d+$/.test(c))
    .map(Number);
  return String(nummers.length ? Math.max(...nummers) + 1 : DEBITEUR_START);
}

function normalizeNaam(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|holding|beheer|gmbh|ltd)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
function normalizeZip(s?: string | null): string {
  return (s ?? '').toUpperCase().replace(/\s+/g, '');
}

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

  const code = volgendDebiteurNummer(items);
  await schrijfDebiteur(code, naamVoorZoeken);
  if (companyId) void writeDebiteurNaarHubSpot(companyId, code);
  return code;
}

/** Maakt een Twinfield-debiteur (DEB-dimensie) aan met een gegeven code + naam. */
async function schrijfDebiteur(code: string, naam: string): Promise<void> {
  const xml = `
<dimensions>
  <dimension>
    <type>DEB</type>
    <code>${code}</code>
    <name>${escapeXml(naam)}</name>
    <shortname>${escapeXml(naam.slice(0, 20))}</shortname>
  </dimension>
</dimensions>`.trim();
  const response = await callProcessXml(xml);
  if (!response.includes('result="1"') && !response.includes("result='1'")) {
    throw new Error(`Debiteur aanmaken mislukt: ${response.slice(0, 300)}`);
  }
}

/** Maakt expliciet een NIEUWE debiteur (na bevestiging in de match-modal). */
export async function maakNieuweDebiteur(naam: string, companyId?: string | null): Promise<string> {
  const items = await finderSearch('DEB', '*', 2000);
  const code = volgendDebiteurNummer(items);
  await schrijfDebiteur(code, naam);
  if (companyId) void writeDebiteurNaarHubSpot(companyId, code);
  return code;
}

/** Leest het adres (postcode + ruwe adrestekst) van een bestaande debiteur uit Twinfield. */
async function readDebiteurAdres(code: string): Promise<{ postcode?: string; tekst: string }> {
  const r = await readDebiteurRaw(code);
  return { postcode: r.postcode, tekst: r.tekst };
}

async function readDebiteurRaw(code: string): Promise<{ tekst: string; name?: string; postcode?: string; city?: string }> {
  const token = await getValidAccessToken();
  const office = token.companyCode ?? '';
  const xml = `<read><type>dimensions</type><office>${office}</office><code>${code}</code><dimtype>DEB</dimtype></read>`;
  const resp = await callProcessXml(xml, office);
  return {
    tekst: resp,
    name: resp.match(/<name>([^<]+)<\/name>/i)?.[1]?.trim(),
    postcode: resp.match(/<postcode>([^<]+)<\/postcode>/i)?.[1]?.trim(),
    city: resp.match(/<city>([^<]+)<\/city>/i)?.[1]?.trim(),
  };
}

/** Volledige NAW van een Twinfield-debiteur (voor het invullen van het factuuradres bij selectie). */
export async function readDebiteur(code: string): Promise<{ code: string; naam: string; adres: string; postcode: string; plaats: string }> {
  const r = await readDebiteurRaw(code);
  // straat = eerste address-field dat een huisnummer (cijfer) bevat
  let adres = '';
  const velden = [...r.tekst.matchAll(/<field\d>([^<]*)<\/field\d>/gi)].map((m) => m[1].trim());
  adres = velden.find((v) => /\d/.test(v) && !/^\d{4}\s?[a-z]{2}$/i.test(v)) ?? '';
  return { code, naam: r.name ?? '', adres, postcode: r.postcode ?? '', plaats: r.city ?? '' };
}

export interface DebiteurMatchInput {
  gekoppeldeCode?: string | null;
  postcode?: string | null;
  huisnummer?: string | null;
}

/**
 * Zoekt bestaande Twinfield-debiteuren als match-kandidaten (geen blinde creatie).
 * Scoort op: reeds gekoppelde code (100), naam-gelijkenis (95 exact / 70 bevat) en — voor de
 * top naam-kandidaten — een adres-match op postcode(+huisnummer) (boost naar 90).
 */
export async function searchDebiteurCandidates(
  klantNaam: string,
  opts: DebiteurMatchInput = {},
): Promise<MatchKandidaat[]> {
  const items = await finderSearch('DEB', '*', 2000);
  const kandidaten: MatchKandidaat[] = [];
  const seen = new Set<string>();

  if (opts.gekoppeldeCode) {
    const hit = items.find((i) => i.code === opts.gekoppeldeCode);
    kandidaten.push({ id: opts.gekoppeldeCode, naam: hit?.name ?? klantNaam, reden: 'Al gekoppeld aan deze klant', score: 100 });
    seen.add(opts.gekoppeldeCode);
  }

  const doel = normalizeNaam(klantNaam);
  const scored = items
    .filter((i) => !seen.has(i.code))
    .map((i) => {
      const n = normalizeNaam(i.name);
      let score = 0; let reden = '';
      if (doel && n && n === doel) { score = 95; reden = 'Naam exact'; }
      else if (doel && n && (n.includes(doel) || doel.includes(n))) { score = 70; reden = 'Naam vergelijkbaar'; }
      return { i, score, reden };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Adres-match (postcode + huisnummer) voor de top naam-kandidaten → boost
  if (opts.postcode) {
    const pcDoel = normalizeZip(opts.postcode);
    for (const x of scored) {
      try {
        const adr = await readDebiteurAdres(x.i.code);
        const pcOk = adr.postcode && normalizeZip(adr.postcode) === pcDoel;
        const hnOk = !opts.huisnummer || adr.tekst.toLowerCase().includes(String(opts.huisnummer).toLowerCase());
        if (pcOk && hnOk) {
          x.score = Math.max(x.score, 90);
          x.reden = x.reden ? `${x.reden} + adres` : 'Adres match (postcode/huisnummer)';
        }
      } catch { /* adres niet leesbaar → negeren */ }
    }
    scored.sort((a, b) => b.score - a.score);
  }

  for (const x of scored) {
    kandidaten.push({ id: x.i.code, naam: x.i.name, reden: x.reden, score: x.score });
  }
  return kandidaten;
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
