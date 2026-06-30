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
import { supabaseAdmin } from '../supabaseAdmin';
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

// Grootboekrekeningen (dim1) per type.
// LET OP: dit is de TEST-mapping voor administratie 202500005 (PEPE Wagenparkbeheer test). Die admin
// dwingt codes [0-3]999 af en had geen omzetrekeningen → we hebben 3500/3510/3520/3540 aangemaakt.
// Voor PRODUCTIE (202500006 = PEPE Wagenparkbeheer B.V.) levert de boekhouder de echte omzet-grootboeken
// + vatcodes; dan deze mapping omzetten (evt. per administratie). NIET aan 202500006 komen tijdens testen.
export const GROOTBOEK: Record<FactuurType, string> = {
  auto: '3500',            // Omzet auto-verkoop (test 202500005)
  wagenparkbeheer: '3510', // Omzet wagenparkbeheer (test 202500005)
  shortlease: '3520',      // Omzet shortlease (test 202500005)
  werk_derden: '3540',     // Doorbelasting/diensten (test 202500005)
  diensten_overig: '3540',
};

// ── Twinfield-ARTIKELEN (boekhouder-export 2026-06-30, admin 202500005) ──────────────────
// We boeken op ARTIKELCODE (+ subarticle 1); Twinfield leidt grootboek + vatcode af van het artikel.
// grootboek/vatcode hier = referentie (matcht de artikeldefinitie). BPM-artikel volgt nog (env-override).
export const ARTIKEL_SUBCODE = '1';
export const ARTIKELEN: Record<string, { grootboek: string; vatcode: string }> = {
  BTWAUTO:     { grootboek: '8030', vatcode: 'VH' },
  BTWAUTOBL:   { grootboek: '8056', vatcode: 'ICP' },
  HANDELBTW:   { grootboek: '8030', vatcode: 'VH' },
  HANDELMARGE: { grootboek: '8053', vatcode: 'VN' },
  MARGE:       { grootboek: '8053', vatcode: 'VN' },
  MARGEAUTOBL: { grootboek: '8056', vatcode: 'VN' },  // marge blijft margeregeling, ook buitenland (VN)
  DERDEN:      { grootboek: '8033', vatcode: 'VH' },
  DERDENBL:    { grootboek: '8056', vatcode: 'ICP' },
  DIVERSEN:    { grootboek: '8054', vatcode: 'VH' },
  DIVERSENBL:  { grootboek: '8075', vatcode: 'ICP' },
  SHORT:       { grootboek: '8031', vatcode: 'VH' },
  VERHUUR:     { grootboek: '8032', vatcode: 'VH' },
  WPB:         { grootboek: '8034', vatcode: 'VH' },
  WPBBL:       { grootboek: '8055', vatcode: 'ICP' },
};
// BPM-regel: nog geen artikel in Twinfield. Tijdelijke override via env tot 't artikel bestaat.
export const BPM_ARTIKEL = process.env.TWINFIELD_BPM_ARTIKEL || '';

// Bepaalt de Twinfield-artikelcode voor één factuurregel op basis van factuurtype + context.
// intra = buitenlands (niet-NL) btw-nummer → buitenland-artikel (ICP 0%, m.u.v. marge = VN).
export function bepaalArtikel(opts: {
  type: FactuurType;
  handelsconditie?: boolean;
  intra: boolean;
  btw_code: BtwCode;
  isBpm?: boolean;
}): string {
  if (opts.isBpm) return BPM_ARTIKEL; // leeg → caller valt terug op los artikel tot BPM-artikel bestaat
  const { intra, handelsconditie } = opts;
  switch (opts.type) {
    case 'auto':
      if (opts.btw_code === 'marge') return intra ? 'MARGEAUTOBL' : (handelsconditie ? 'HANDELMARGE' : 'MARGE');
      return intra ? 'BTWAUTOBL' : (handelsconditie ? 'HANDELBTW' : 'BTWAUTO');
    case 'werk_derden':     return intra ? 'DERDENBL' : 'DERDEN';
    case 'wagenparkbeheer': return intra ? 'WPBBL' : 'WPB';
    case 'shortlease':      return 'SHORT'; // geen buitenland-variant
    case 'diensten_overig':
    default:                return intra ? 'DIVERSENBL' : 'DIVERSEN';
  }
}

export interface TwinfieldFactuurRegelInput {
  omschrijving: string;
  aantal: number;
  prijs_excl: number;
  btw_code: BtwCode;
  grootboek: string;
  article?: string; // Twinfield-artikelcode (leeg → los artikel 0 met grootboek+vatcode, fallback)
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

/** Volledige NAW van een Twinfield-debiteur (voor invullen factuuradres + matching-index). */
export async function readDebiteur(code: string): Promise<{ code: string; naam: string; adres: string; postcode: string; plaats: string; huisnummer: string; kvk: string; btw: string }> {
  const r = await readDebiteurRaw(code);
  // straat = eerste address-field dat een huisnummer (cijfer) bevat, maar geen postcode (1234 AB)
  const velden = [...r.tekst.matchAll(/<field\d>([^<]*)<\/field\d>/gi)].map((m) => m[1].trim());
  const adres = velden.find((v) => /\d/.test(v) && !/^\d{4}\s?[a-z]{2}$/i.test(v)) ?? '';
  const huisnummer = adres.match(/\d+/)?.[0] ?? '';
  // KvK (cocnumber) en BTW-nummer (vatnumber) — best-effort; Twinfield levert ze niet altijd.
  const kvk = r.tekst.match(/<cocnumber>([^<]+)<\/cocnumber>/i)?.[1]?.trim() ?? '';
  const btw = r.tekst.match(/<vatnumber>([^<]+)<\/vatnumber>/i)?.[1]?.trim() ?? '';
  return { code, naam: r.name ?? '', adres, postcode: r.postcode ?? '', plaats: r.city ?? '', huisnummer, kvk, btw };
}

/** Lijst van alle debiteuren (alleen code+naam) — snel, voor de naam-index. */
export async function listAlleDebiteuren(): Promise<Array<{ code: string; name: string }>> {
  return finderSearch('DEB', '*', 5000);
}

export interface DebiteurMatchInput {
  gekoppeldeCode?: string | null;
  postcode?: string | null;
  huisnummer?: string | null;
}

/**
 * Zoekt bestaande Twinfield-debiteuren als match-kandidaten via de lokale index
 * (twinfield_debiteuren). Matcht op: reeds gekoppelde code (100), naam-exact (95)/vergelijkbaar (70)
 * ÉN postcode+huisnummer (92, óók als de naam afwijkt). Index leeg → fallback live naam-zoek.
 */
export async function searchDebiteurCandidates(
  klantNaam: string,
  opts: DebiteurMatchInput = {},
): Promise<MatchKandidaat[]> {
  const { data: rows } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code, naam, postcode, huisnummer, adres');

  const doel = normalizeNaam(klantNaam);

  // Fallback: index nog niet gevuld → live naam-zoek (zonder adres-match). Synchroniseer de index.
  if (!rows || rows.length === 0) {
    const items = await finderSearch('DEB', '*', 2000);
    return items
      .map((i) => {
        const n = normalizeNaam(i.name);
        let score = 0; let reden = '';
        if (doel && n === doel) { score = 95; reden = 'Naam exact'; }
        else if (doel && n && (n.includes(doel) || doel.includes(n))) { score = 70; reden = 'Naam vergelijkbaar'; }
        return { id: i.code, naam: i.name, reden, score };
      })
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  const pcDoel = normalizeZip(opts.postcode);
  const hn = (opts.huisnummer ?? '').toString().trim();
  const out: MatchKandidaat[] = [];
  const seen = new Set<string>();

  if (opts.gekoppeldeCode) {
    const hit = rows.find((r) => r.code === opts.gekoppeldeCode);
    out.push({ id: opts.gekoppeldeCode, naam: hit?.naam ?? klantNaam, reden: 'Al gekoppeld aan deze klant', score: 100 });
    seen.add(opts.gekoppeldeCode);
  }

  const scored = rows
    .filter((r) => !seen.has(r.code))
    .map((r) => {
      const n = normalizeNaam(r.naam ?? '');
      let score = 0; let reden = '';
      if (pcDoel && r.postcode && normalizeZip(r.postcode) === pcDoel) {
        const hnOk = !hn || (r.huisnummer ?? '') === hn || (r.adres ?? '').includes(hn);
        if (hnOk) { score = 92; reden = 'Adres (postcode + huisnummer)'; }
      }
      if (doel && n && n === doel) { reden = score >= 92 ? 'Naam + adres' : 'Naam exact'; score = Math.max(score, 95); }
      else if (doel && n && (n.includes(doel) || doel.includes(n))) { if (!reden) reden = 'Naam vergelijkbaar'; score = Math.max(score, 70); }
      return { r, score, reden };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const x of scored) out.push({ id: x.r.code, naam: x.r.naam ?? '', reden: x.reden, score: x.score });
  return out;
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
    .map((r, i) => {
      // Echte artikelcode? Dan boeken op article + subarticle, met vatcode/grootboek uit de artikeldefinitie.
      // Geen/0 → los artikel (fallback): vatcode uit btw_code + grootboek per regel.
      const artDef = r.article ? ARTIKELEN[r.article] : undefined;
      const articleCode = r.article && r.article !== '0' ? r.article : '0';
      const subartXml = articleCode !== '0' ? `\n      <subarticle>${ARTIKEL_SUBCODE}</subarticle>` : '';
      const vatcode = artDef ? artDef.vatcode : VATCODE[r.btw_code];
      const dim1 = artDef ? artDef.grootboek : r.grootboek;
      return `
    <line id="${i + 1}">
      <article>${escapeXml(articleCode)}</article>${subartXml}
      <quantity>${r.aantal}</quantity>
      <units>1</units>
      <unitspriceexcl>${(sign * r.prijs_excl).toFixed(2)}</unitspriceexcl>
      <vatcode>${vatcode}</vatcode>
      <description>${escapeXml(r.omschrijving)}</description>
      <dim1>${dim1}</dim1>
    </line>`;
    })
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
    // Twinfield zet de fout-reden in msg="..."-attributen op het falende element.
    const msgs = [...response.matchAll(/msg="([^"]+)"/g)].map((m) => m[1]);
    const detail = msgs.length ? msgs.join(' · ') : response.slice(0, 500);
    return { ok: false, error: `Twinfield weigert de factuur: ${detail}` };
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
