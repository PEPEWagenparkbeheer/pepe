// HubSpot client voor PEPE Flow.
// Server-only. Gebaseerd op tsd-dashboard/src/lib/hubspot.ts, uitgebreid
// met search+create voor Company, Contact en Deal zodat de facturen-inbox
// klanten en auto's kan aanmaken die nog niet in HubSpot staan.

import type { MatchKandidaat } from '@/types/match';

const HS_BASE = 'https://api.hubapi.com';

function getToken(): string {
  const t = process.env.HUBSPOT_TOKEN?.trim();
  if (!t) throw new Error('HUBSPOT_TOKEN ontbreekt in .env.local');
  return t;
}

async function hsFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${res.status} ${url}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// Dealstage "Rijdend / Klant" — overgenomen uit tsd-dashboard.
// Bevestiging vereist: zie open punt 3 in plan.
export const DEALSTAGE_VERKOCHT = '104593342';
export const DEALSTAGE_IN_BESTELLING = '167690431';

// ── Company ─────────────────────────────────────────────────────

export interface CompanyInput {
  name: string;
  kvk?: string;
  domain?: string;
  phone?: string;
  address?: string;   // straat + huisnummer
  city?: string;      // plaats
  zip?: string;       // postcode
  country?: string;   // land
}

export async function searchCompanyByName(name: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/companies/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['name'],
        filterGroups: [{
          filters: [{ propertyName: 'name', operator: 'EQ', value: name.trim() }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

// Normalisatie voor naam-vergelijking: lowercase, weggehaalde leestekens
// en bedrijfsvorm-suffixen die vaak in/uitgeschreven worden.
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?|gmbh|holding|maatschap|stichting)\b/g, '')
    .replace(/[.,'`"&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeZip(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '');
}

// Huisnummer uit een adresregel ("Driemanssteeweg 62" → "62", "Oemstraat 3a" → "3").
// Bedoeld als extra match-signaal: zelfde postcode + huisnummer = vrijwel zeker hetzelfde adres.
function huisnummer(adres?: string | null): string {
  const m = (adres ?? '').match(/(\d+)\s*[a-zA-Z]?\s*$/) ?? (adres ?? '').match(/\b(\d+)\b/);
  return m ? m[1] : '';
}

function namesSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Een van beide ingesloten in de ander (afkortingen, extra "Beheer", etc)
  if (na.length >= 4 && nb.length >= 4) {
    if (nb.includes(na) || na.includes(nb)) return true;
  }
  return false;
}

interface CompanyMatchInput {
  name: string;
  postcode?: string | null;
  plaats?: string | null;
  adres?: string | null;   // straat + huisnummer
}

// Zoekt eerst exact op naam; vindt niets → free-text query op naam +
// scoort kandidaten op genormaliseerde naam, postcode/plaats en huisnummer.
// Voorkomt duplicaten bij spelling-variaties ("Job's Bemiddeling B.V." vs
// "Jobs Bemiddeling BV") én bij naamsverschillen op hetzelfde adres.
export async function findCompany({ name, postcode, plaats, adres }: CompanyMatchInput): Promise<string | null> {
  if (!name?.trim()) return null;

  const exact = await searchCompanyByName(name);
  if (exact) return exact;

  const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
    `${HS_BASE}/crm/v3/objects/companies/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 20,
        query: name,
        properties: ['name', 'zip', 'city', 'address'],
      }),
    },
  );

  const kandidaten = data.results ?? [];
  const zip = postcode ? normalizeZip(postcode) : '';
  const nr = huisnummer(adres);

  // 1. Naam similar + matching postcode → zeer zekere match
  if (zip) {
    for (const c of kandidaten) {
      const p = c.properties ?? {};
      if (p.zip && normalizeZip(p.zip) === zip && namesSimilar(p.name ?? '', name)) {
        return c.id;
      }
    }
  }

  // 2. Postcode + huisnummer match → zelfde adres, vrijwel zeker dezelfde klant
  //    (vangt naamsverschillen zoals "Fues CompleX" vs "Fues Complex Holding")
  if (zip && nr) {
    for (const c of kandidaten) {
      const p = c.properties ?? {};
      if (p.zip && normalizeZip(p.zip) === zip && huisnummer(p.address) === nr) {
        return c.id;
      }
    }
  }

  // 3. Naam similar — altijd als fallback, ook als postcode aanwezig maar niet matcht
  for (const c of kandidaten) {
    if (namesSimilar(c.properties?.name ?? '', name)) return c.id;
  }

  // 4. Naam similar + huisnummer (zonder postcode-info) → match op gedeeltelijk adres
  if (nr) {
    for (const c of kandidaten) {
      const p = c.properties ?? {};
      if (huisnummer(p.address) === nr && namesSimilar(p.name ?? '', name)) return c.id;
    }
  }

  // 5. Exacte postcode + plaats match (zelfde adres = zelfde klant)
  if (zip && plaats) {
    const city = plaats.toLowerCase().trim();
    for (const c of kandidaten) {
      const p = c.properties ?? {};
      if (p.zip && normalizeZip(p.zip) === zip
          && p.city && p.city.toLowerCase().trim() === city) {
        return c.id;
      }
    }
  }

  return null;
}

// HubSpot-property kvk_nummer is van het type 'number': alleen cijfers toegestaan.
// Een waarde met spatie/punt/letters geeft anders een 400 ("geen geldig getal" /
// "There was a problem with the request").
function kvkDigits(kvk?: string | null): string {
  return (kvk ?? '').replace(/\D/g, '');
}

export async function searchCompanyByKvk(kvk: string): Promise<string | null> {
  const k = kvkDigits(kvk);
  if (!k) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/companies/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['kvk_nummer'],
        filterGroups: [{
          filters: [{ propertyName: 'kvk_nummer', operator: 'EQ', value: k }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

export async function createCompany(input: CompanyInput): Promise<string> {
  const properties: Record<string, string> = { name: input.name };
  if (kvkDigits(input.kvk)) properties.kvk_nummer = kvkDigits(input.kvk);
  if (input.domain) properties.domain = input.domain;
  if (input.phone) properties.phone = input.phone;
  if (input.address) properties.address = input.address;
  if (input.city) properties.city = input.city;
  if (input.zip) properties.zip = input.zip;
  if (input.country) properties.country = input.country;

  const data = await hsFetch<{ id: string }>(
    `${HS_BASE}/crm/v3/objects/companies`,
    { method: 'POST', body: JSON.stringify({ properties }) },
  );
  return data.id;
}

export async function updateCompany(id: string, input: Partial<Omit<CompanyInput, 'name'>>): Promise<void> {
  const properties: Record<string, string> = {};
  if (kvkDigits(input.kvk)) properties.kvk_nummer = kvkDigits(input.kvk);
  if (input.domain) properties.domain = input.domain;
  if (input.phone) properties.phone = input.phone;
  if (input.address) properties.address = input.address;
  if (input.city) properties.city = input.city;
  if (input.zip) properties.zip = input.zip;
  if (input.country) properties.country = input.country;
  if (Object.keys(properties).length === 0) return;
  await hsFetch(
    `${HS_BASE}/crm/v3/objects/companies/${id}`,
    { method: 'PATCH', body: JSON.stringify({ properties }) },
  );
}

// ── Contact ─────────────────────────────────────────────────────

export interface ContactInput {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  address?: string;   // straat + huisnummer
  city?: string;
  zip?: string;
  country?: string;
}

export async function searchContactByEmail(email: string): Promise<string | null> {
  if (!email?.trim()) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/contacts/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['email'],
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: email.trim().toLowerCase() }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

export async function searchContactByName(firstname: string, lastname: string): Promise<string | null> {
  if (!firstname?.trim() || !lastname?.trim()) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/contacts/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['firstname', 'lastname'],
        filterGroups: [{
          filters: [
            { propertyName: 'firstname', operator: 'EQ', value: firstname.trim() },
            { propertyName: 'lastname', operator: 'EQ', value: lastname.trim() },
          ],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

export async function createContact(input: ContactInput): Promise<string> {
  const properties: Record<string, string> = {};
  if (input.email) properties.email = input.email.trim().toLowerCase();
  if (input.firstname) properties.firstname = input.firstname;
  if (input.lastname) properties.lastname = input.lastname;
  if (input.phone) properties.phone = input.phone;
  if (input.address) properties.address = input.address;
  if (input.city) properties.city = input.city;
  if (input.zip) properties.zip = input.zip;
  if (input.country) properties.country = input.country;

  const data = await hsFetch<{ id: string }>(
    `${HS_BASE}/crm/v3/objects/contacts`,
    { method: 'POST', body: JSON.stringify({ properties }) },
  );
  return data.id;
}

/**
 * Werkt een BESTAAND contact (berijder) bij: overschrijft alleen de meegegeven,
 * niet-lege velden (laat ontbrekende velden ongemoeid, wist dus nooit data).
 */
export async function updateContact(id: string, input: ContactInput): Promise<void> {
  if (!id?.trim()) return;
  const properties: Record<string, string> = {};
  if (input.email) properties.email = input.email.trim().toLowerCase();
  if (input.firstname) properties.firstname = input.firstname;
  if (input.lastname) properties.lastname = input.lastname;
  if (input.phone) properties.phone = input.phone;
  if (input.address) properties.address = input.address;
  if (input.city) properties.city = input.city;
  if (input.zip) properties.zip = input.zip;
  if (input.country) properties.country = input.country;
  if (Object.keys(properties).length === 0) return;
  await hsFetch(
    `${HS_BASE}/crm/v3/objects/contacts/${id}`,
    { method: 'PATCH', body: JSON.stringify({ properties }) },
  );
}

// ── Deal (= auto, dealname = kenteken) ──────────────────────────

export interface DealInput {
  kenteken: string;
  merk_type?: string;
  brandstof?: string;            // HubSpot enum: "Benzine"|"Diesel"|"Elektrisch"|...
  type_voertuig?: string;
  type_aanschaf?: string;        // HubSpot enum, "Aanschaf" = Eigendom (default bij factuur)
  leverancier?: string;
  land_kenteken?: string;        // "NL"|"BE"|"DE"|"GB"
  fiscale_waarde?: number;       // cataloguswaarde
  inzetdatum?: string;           // ISO yyyy-mm-dd
  apk_datum?: string;            // ISO yyyy-mm-dd
  kilometerstand_huidig?: number;
  dealstage?: string;
  pipeline?: string;
  dealname?: string;             // overschrijft kenteken-gebaseerde dealname
  leasemaatschappij?: string;    // naam leasemaatschappij -> leasemaatschappij_goed
  verwachte_einddatum?: string;  // ISO yyyy-mm-dd
}

/** Exacte dealname-match zonder normalisatie — voor "InBestelling [contractnummer]" lookups. */
export async function searchDealByName(naam: string): Promise<string | null> {
  if (!naam?.trim()) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/deals/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['dealname'],
        filterGroups: [{
          filters: [{ propertyName: 'dealname', operator: 'EQ', value: naam.trim() }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

/** Zoekt een bestaande deal op het lease-/bestelcontractnummer (property contractnummer_lease). */
export async function searchDealByContractnummer(contractnummer: string): Promise<string | null> {
  const c = String(contractnummer ?? '').trim();
  if (!c) return null;
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/deals/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['contractnummer_lease'],
        filterGroups: [{
          filters: [{ propertyName: 'contractnummer_lease', operator: 'EQ', value: c }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

export async function searchDealByKenteken(kenteken: string): Promise<string | null> {
  if (!kenteken?.trim()) return null;
  const norm = kenteken.replace(/\s+/g, '').toUpperCase();
  const data = await hsFetch<{ results?: { id: string }[] }>(
    `${HS_BASE}/crm/v3/objects/deals/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: ['dealname'],
        filterGroups: [{
          filters: [{ propertyName: 'dealname', operator: 'EQ', value: norm }],
        }],
      }),
    },
  );
  return data.results?.[0]?.id ?? null;
}

// Dealstage "Rijdend" — alleen rijdende voertuigen tellen mee voor BREIN.
// (zelfde id als DEALSTAGE_VERKOCHT hierboven, commentaar "Rijdend / Klant").
export const DEALSTAGE_RIJDEND = '104593342';

export interface RijdendeDeal {
  id: string;
  kenteken: string;
  leasemaatschappij: string | null;
  type_aanschaf: string | null;
  brandstof: string | null;
  fiscale_waarde: string | null;
  apk_datum: string | null;
  winterbanden_in_contract: string | null;
  verwachte_einddatum: string | null;
}

/**
 * Alle aan een contact gekoppelde deals in stage 'rijdend'.
 * Voorwaarde: BREIN gebruikt alleen voertuigen die daadwerkelijk rijden.
 */
export async function getRijdendeDeals(contactId: string): Promise<RijdendeDeal[]> {
  if (!contactId?.trim()) return [];
  const assoc = await hsFetch<{ results?: { toObjectId: string | number }[] }>(
    `${HS_BASE}/crm/v4/objects/contacts/${contactId}/associations/deals`,
  ).catch(() => ({ results: [] as { toObjectId: string | number }[] }));

  // HubSpot v4 geeft toObjectId als getal terug — naar string casten.
  const ids = (assoc.results ?? []).map((r) => String(r.toObjectId));
  const out: RijdendeDeal[] = [];
  for (const id of ids) {
    const f = await getDealFields(id, [
      'dealname', 'dealstage', 'leasemaatschappij_goed', 'type_aanschaf',
      'brandstof', 'fiscale_waarde', 'apk_datum', 'winterbanden_in_contract', 'verwachte_einddatum',
    ]).catch(() => ({} as Record<string, string>));
    if (f.dealstage !== DEALSTAGE_RIJDEND) continue;
    out.push({
      id,
      kenteken: f.dealname ?? '',
      leasemaatschappij: f.leasemaatschappij_goed ?? null,
      type_aanschaf: f.type_aanschaf ?? null,
      brandstof: f.brandstof ?? null,
      fiscale_waarde: f.fiscale_waarde ?? null,
      apk_datum: f.apk_datum ?? null,
      winterbanden_in_contract: f.winterbanden_in_contract ?? null,
      verwachte_einddatum: f.verwachte_einddatum ?? null,
    });
  }
  return out;
}

// Shortlease die PEPE doorbelast: deals met deze type_aanschaf-waarde (in HubSpot toe te voegen).
export const SHORTLEASE_TYPE_AANSCHAF = 'Short Lease via PEPE';
// Maandhuur-property: probeer meerdere namen (eerste niet-lege telt). BEVESTIGEN welke bestaat.
const SHORTLEASE_MAANDHUUR_PROPS = ['leasebedrag_per_maand_excl__btw', 'shortlease_maandbedrag', 'maandhuur', 'leasebedrag'];

export interface ShortleaseDeal {
  id: string;
  kenteken: string;
  maandhuur: number | null;
  inzetdatum: string | null;        // ISO yyyy-mm-dd
  verwachte_einddatum: string | null;
}

/** Alle shortlease-deals (type_aanschaf = "Shortlease via PEPE") met huurgegevens. */
export async function getShortleaseDeals(): Promise<ShortleaseDeal[]> {
  const props = ['dealname', 'type_aanschaf', 'inzetdatum', 'verwachte_einddatum', ...SHORTLEASE_MAANDHUUR_PROPS];
  const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
    `${HS_BASE}/crm/v3/objects/deals/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        limit: 100,
        properties: props,
        filterGroups: [{
          filters: [{ propertyName: 'type_aanschaf', operator: 'EQ', value: SHORTLEASE_TYPE_AANSCHAF }],
        }],
      }),
    },
  ).catch(() => ({ results: [] as { id: string; properties: Record<string, string> }[] }));

  return (data.results ?? []).map((d) => {
    const p = d.properties ?? {};
    let maandhuur: number | null = null;
    for (const key of SHORTLEASE_MAANDHUUR_PROPS) {
      const v = Number(p[key]);
      if (p[key] && !isNaN(v)) { maandhuur = v; break; }
    }
    return {
      id: d.id,
      kenteken: (p.dealname ?? '').toUpperCase(),
      maandhuur,
      inzetdatum: p.inzetdatum ?? null,
      verwachte_einddatum: p.verwachte_einddatum ?? null,
    };
  });
}

/**
 * Rijdende deals (= voertuigen) die aan een COMPANY zijn gekoppeld, met hun kenteken.
 * Voor wagenparkbeheer-facturatie: tel/groepeer voertuigen per (dochter)onderneming.
 */
export async function getRijdendeDealsForCompany(
  companyId: string,
): Promise<{ kentekens: string[]; aantal: number }> {
  const id = String(companyId ?? '').trim();
  if (!id) return { kentekens: [], aantal: 0 };

  const assoc = await hsFetch<{ results?: { toObjectId: string | number }[] }>(
    `${HS_BASE}/crm/v4/objects/companies/${id}/associations/deals?limit=500`,
  ).catch(() => ({ results: [] as { toObjectId: string | number }[] }));

  const ids = (assoc.results ?? []).map((r) => String(r.toObjectId));
  const kentekens: string[] = [];
  for (const dealId of ids) {
    const f = await getDealFields(dealId, ['dealname', 'dealstage']).catch(
      () => ({} as Record<string, string>),
    );
    if (f.dealstage !== DEALSTAGE_RIJDEND) continue;
    if (f.dealname) kentekens.push(f.dealname.toUpperCase());
  }
  kentekens.sort();
  return { kentekens, aantal: kentekens.length };
}

/** Haalt specifieke velden van een deal (= voertuig/contract) op. */
export async function getDealFields(
  dealId: string,
  props: string[],
): Promise<Record<string, string>> {
  const id = String(dealId ?? '').trim();
  if (!id) return {};
  const data = await hsFetch<{ properties?: Record<string, string> }>(
    `${HS_BASE}/crm/v3/objects/deals/${id}?properties=${props.join(',')}`,
  );
  return data.properties ?? {};
}

// ── Generieke HubSpot enum matcher ───────────────────────────────────────────
// Haalt opties op voor een deal-property en matcht vrije tekst op de dichtstbij-
// zijnde optie-waarde. Cache per property per cold start.

const _enumCache: Record<string, Array<{ value: string; label: string }>> = {};

async function fetchEnumOpties(property: string): Promise<Array<{ value: string; label: string }>> {
  if (_enumCache[property]) return _enumCache[property];
  try {
    const d = await hsFetch<{ options?: Array<{ value: string; label: string }> }>(
      `${HS_BASE}/crm/v3/properties/deals/${property}`,
    );
    _enumCache[property] = d.options ?? [];
  } catch {
    _enumCache[property] = [];
  }
  return _enumCache[property];
}

function enumNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Matcht vrije tekst op een geldige enum-optie. Retourneert `null` als er geen
// betrouwbare match is — de caller laat de property dan wég i.p.v. een ongeldige
// waarde te sturen (HubSpot geeft anders een 400 "was not one of the allowed options").
async function matchEnum(property: string, waarde: string): Promise<string | null> {
  const opties = await fetchEnumOpties(property);
  // Kunnen we de opties niet ophalen, dan durven we de waarde niet te valideren →
  // niet wegschrijven (voorkomt 400's bij tijdelijke API-fouten).
  if (!opties.length) return null;
  const zoek = enumNorm(waarde);
  const exact = opties.find((o) => enumNorm(o.label) === zoek || enumNorm(o.value) === zoek);
  if (exact) return exact.value;
  const bevat = opties.find((o) => {
    const lbl = enumNorm(o.label);
    return lbl.includes(zoek) || zoek.includes(lbl);
  });
  if (bevat) return bevat.value;
  console.warn(`matchEnum(${property}): geen geldige optie voor "${waarde}" — property wordt overgeslagen`);
  return null;
}

/**
 * Normaliseert een leasemaatschappij-naam naar de juiste HubSpot-dropdownwaarde
 * voor lastige gevallen. Van Mossel levert onder twee namen: "van Mossel Lease"
 * (regulier) en "Shortlease van Mossel" (shortlease) — de vrije tekst uit het
 * document ("Van Mossel Autolease Zuid B.V.") matcht op geen van beide vanzelf.
 * isShortlease komt uit het contract (type_aanschaf bevat "short").
 */
export function mapLeasemaatschappij(naam: string, isShortlease: boolean): string {
  const n = (naam ?? '').trim();
  if (/mossel/i.test(n)) {
    return (isShortlease || /short/i.test(n)) ? 'Shortlease van Mossel' : 'van Mossel Lease';
  }
  return n;
}

/** PATCH losse velden op een deal (= voertuig/contract). Leeg object = no-op. */
export async function updateDealFields(
  dealId: string,
  properties: Record<string, string>,
): Promise<void> {
  const id = String(dealId ?? '').trim();
  if (!id || Object.keys(properties).length === 0) return;
  // Match enum-properties automatisch naar geldige HubSpot-waarden.
  // Geen geldige match → property uit de payload verwijderen (anders 400).
  properties = { ...properties };
  for (const k of ['leasemaatschappij_goed', 'type_aanschaf'] as const) {
    if (!properties[k]) continue;
    const m = await matchEnum(k, properties[k]);
    if (m) properties[k] = m;
    else delete properties[k];
  }
  if (Object.keys(properties).length === 0) return;
  await hsFetch(
    `${HS_BASE}/crm/v3/objects/deals/${id}`,
    { method: 'PATCH', body: JSON.stringify({ properties }) },
  );
}

/** Haalt specifieke velden van een contact (= berijder) op. */
export async function getContactFields(
  contactId: string,
  props: string[],
): Promise<Record<string, string>> {
  const id = String(contactId ?? '').trim();
  if (!id) return {};
  const data = await hsFetch<{ properties?: Record<string, string> }>(
    `${HS_BASE}/crm/v3/objects/contacts/${id}?properties=${props.join(',')}`,
  );
  return data.properties ?? {};
}

/** Haalt specifieke velden van een company (= klant/werkgever) op. */
export async function getCompanyFields(
  companyId: string,
  props: string[],
): Promise<Record<string, string>> {
  const id = String(companyId ?? '').trim();
  if (!id) return {};
  const data = await hsFetch<{ properties?: Record<string, string> }>(
    `${HS_BASE}/crm/v3/objects/companies/${id}?properties=${props.join(',')}`,
  );
  return data.properties ?? {};
}

/** Eerste aan een deal gekoppelde contact-id (deal → contact). */
export async function getDealContactId(dealId: string): Promise<string | null> {
  if (!dealId?.trim()) return null;
  const assoc = await hsFetch<{ results?: { toObjectId: string | number }[] }>(
    `${HS_BASE}/crm/v4/objects/deals/${dealId}/associations/contacts`,
  ).catch(() => ({ results: [] as { toObjectId: string | number }[] }));
  const id = assoc.results?.[0]?.toObjectId;
  // HubSpot v4 geeft toObjectId als getal terug — altijd naar string casten.
  return id != null ? String(id) : null;
}

/** Eerste aan een deal gekoppelde company-id (deal → company). */
export async function getDealCompanyId(dealId: string): Promise<string | null> {
  if (!dealId?.trim()) return null;
  const assoc = await hsFetch<{ results?: { toObjectId: string | number }[] }>(
    `${HS_BASE}/crm/v4/objects/deals/${dealId}/associations/companies`,
  ).catch(() => ({ results: [] as { toObjectId: string | number }[] }));
  const id = assoc.results?.[0]?.toObjectId;
  return id != null ? String(id) : null;
}

// ── Inkoopverklaring: NAW-gegevens op kenteken ──────────────────

export interface InkoopNaw {
  gevonden: boolean;
  bron?: 'contact' | 'company';
  naam?: string;
  straat?: string;
  postcode?: string;
  plaats?: string;
  telefoon?: string;
  email?: string;
}

/**
 * Zoekt de auto (deal, dealname = kenteken) in HubSpot en geeft de NAW-gegevens
 * van het gekoppelde contact terug (val terug op company als er geen contact is).
 * Bedoeld om het inkoopverklaring-formulier automatisch te vullen.
 */
export async function getInkoopNawByKenteken(kenteken: string): Promise<InkoopNaw> {
  // Deals kunnen mét of zónder streepjes opgeslagen zijn — probeer beide varianten.
  const varianten = [...new Set([
    kenteken.trim().toUpperCase(),
    kenteken.replace(/[-\s]/g, '').toUpperCase(),
  ])].filter(Boolean);

  let dealId: string | null = null;
  for (const k of varianten) {
    dealId = await searchDealByKenteken(k);
    if (dealId) break;
  }
  if (!dealId) return { gevonden: false };

  const contactId = await getDealContactId(dealId);
  if (contactId) {
    const c = await getContactFields(contactId, [
      'firstname', 'lastname', 'email', 'phone', 'address', 'city', 'zip',
    ]).catch(() => ({} as Record<string, string>));
    const naam = [c.firstname, c.lastname].filter(Boolean).join(' ').trim();
    if (naam || c.email) {
      return {
        gevonden: true,
        bron: 'contact',
        naam,
        straat: c.address,
        postcode: c.zip,
        plaats: c.city,
        telefoon: c.phone,
        email: c.email,
      };
    }
  }

  const companyId = await getDealCompanyId(dealId);
  if (companyId) {
    const co = await getCompanyFields(companyId, [
      'name', 'phone', 'address', 'city', 'zip',
    ]).catch(() => ({} as Record<string, string>));
    if (co.name) {
      return {
        gevonden: true,
        bron: 'company',
        naam: co.name,
        straat: co.address,
        postcode: co.zip,
        plaats: co.city,
        telefoon: co.phone,
      };
    }
  }

  return { gevonden: false };
}

export async function createDeal(input: DealInput): Promise<string> {
  const properties: Record<string, string> = {
    dealname: input.dealname ?? input.kenteken.replace(/\s+/g, '').toUpperCase(),
    dealstage: input.dealstage ?? DEALSTAGE_VERKOCHT,
  };
  if (input.pipeline) properties.pipeline = input.pipeline;
  if (input.merk_type) properties.merk___type = input.merk_type;
  if (input.brandstof) properties.brandstof = input.brandstof;
  if (input.type_voertuig) properties.type_voertuig = input.type_voertuig;
  if (input.type_aanschaf) properties.type_aanschaf = input.type_aanschaf;
  if (input.leverancier) properties.leverancier = input.leverancier;
  if (input.land_kenteken) properties.land_kenteken = input.land_kenteken;
  if (input.fiscale_waarde != null) properties.fiscale_waarde = String(input.fiscale_waarde);
  if (input.inzetdatum) properties.inzetdatum = input.inzetdatum;
  if (input.apk_datum) properties.apk_datum = input.apk_datum;
  if (input.kilometerstand_huidig != null) {
    properties.kilometerstand_huidig = String(input.kilometerstand_huidig);
  }
  if (input.leasemaatschappij) {
    const m = await matchEnum('leasemaatschappij_goed', input.leasemaatschappij);
    if (m) properties.leasemaatschappij_goed = m;
  }
  if (properties.type_aanschaf) {
    const m = await matchEnum('type_aanschaf', properties.type_aanschaf);
    if (m) properties.type_aanschaf = m; else delete properties.type_aanschaf;
  }
  if (input.verwachte_einddatum) properties.verwachte_einddatum = input.verwachte_einddatum;

  const data = await hsFetch<{ id: string }>(
    `${HS_BASE}/crm/v3/objects/deals`,
    { method: 'POST', body: JSON.stringify({ properties }) },
  );
  return data.id;
}

// ── Associations ────────────────────────────────────────────────

// HubSpot v4 default association types:
//   deal → company: 5
//   deal → contact: 3
export async function associateDealCompany(dealId: string, companyId: string): Promise<void> {
  await hsFetch(
    `${HS_BASE}/crm/v4/objects/deals/${dealId}/associations/default/companies/${companyId}`,
    { method: 'PUT' },
  );
}

export async function associateDealContact(dealId: string, contactId: string): Promise<void> {
  await hsFetch(
    `${HS_BASE}/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`,
    { method: 'PUT' },
  );
}

export async function associateContactCompany(contactId: string, companyId: string): Promise<void> {
  await hsFetch(
    `${HS_BASE}/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    { method: 'PUT' },
  );
}

// ── Files & Notes (bijlage op een deal/voertuig) ────────────────
// Vereist de scope 'files' op de Private App (notes-write zit er al in).

/** Upload een bestand naar HubSpot Files en geef het file-id terug. */
export async function uploadFile(
  content: ArrayBuffer,
  filename: string,
  folderPath = '/facturen',
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'application/pdf' }), filename);
  form.append('folderPath', folderPath);
  form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false }));
  // GEEN Content-Type meegeven: fetch zet zelf de multipart-boundary.
  const res = await fetch(`${HS_BASE}/files/v3/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HubSpot files ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Maak een notitie (aantekening) op een deal, optioneel met een bijlage-file.
 * associationTypeId 214 = note → deal (HUBSPOT_DEFINED).
 */
export async function createNoteOnDeal(
  dealId: string,
  bodyHtml: string,
  attachmentFileId?: string,
): Promise<string> {
  const properties: Record<string, string> = {
    hs_timestamp: new Date().toISOString(),
    hs_note_body: bodyHtml,
  };
  if (attachmentFileId) properties.hs_attachment_ids = attachmentFileId;
  const data = await hsFetch<{ id: string }>(
    `${HS_BASE}/crm/v3/objects/notes`,
    {
      method: 'POST',
      body: JSON.stringify({
        properties,
        associations: [{
          to: { id: dealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
        }],
      }),
    },
  );
  return data.id;
}

// ── Match-kandidaten voor documentenstroom deduplicatie ──────────────────────

export async function searchContactCandidates(
  achternaam: string,
  voornaam?: string | null,
  bedrijfId?: string | null,
): Promise<MatchKandidaat[]> {
  if (!achternaam?.trim()) return [];
  let results: { id: string; properties: Record<string, string> }[] = [];
  try {
    const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `${HS_BASE}/crm/v3/objects/contacts/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: 10,
          properties: ['firstname', 'lastname', 'email', 'associatedcompanyid'],
          filterGroups: [{ filters: [{ propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: achternaam.trim() }] }],
        }),
      },
    );
    results = data.results ?? [];
  } catch {
    return [];
  }

  const kandidaten: MatchKandidaat[] = [];
  for (const r of results) {
    const p = r.properties ?? {};
    let score = 50;
    let reden = `Achternaam "${p.lastname ?? achternaam}"`;

    if (voornaam && p.firstname) {
      const vn = voornaam.trim().toLowerCase().replace(/\.$/, '');
      const fn = p.firstname.trim().toLowerCase();
      if (fn === vn || fn.startsWith(vn) || vn.startsWith(fn[0] ?? '')) {
        score += 25;
        reden += ` + voornaam "${p.firstname}"`;
      }
    }

    if (bedrijfId && p.associatedcompanyid === bedrijfId) {
      score += 25;
      reden += ' + zelfde bedrijf';
    }

    const naam = [p.firstname, p.lastname].filter(Boolean).join(' ').trim();
    kandidaten.push({ id: r.id, naam: naam || achternaam, email: p.email || undefined, reden, score });
  }

  return kandidaten.sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function searchCompanyCandidates(
  naam: string,
  kvk?: string | null,
  postcode?: string | null,
  adres?: string | null,
): Promise<MatchKandidaat[]> {
  if (!naam?.trim()) return [];

  if (kvk) {
    const id = await searchCompanyByKvk(kvk);
    if (id) return [{ id, naam, reden: `KVK ${kvk} exacte match`, score: 100 }];
  }

  const exactId = await searchCompanyByName(naam);
  if (exactId) return [{ id: exactId, naam, reden: `Naam exact "${naam}"`, score: 90 }];

  let results: { id: string; properties: Record<string, string> }[] = [];
  try {
    const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `${HS_BASE}/crm/v3/objects/companies/search`,
      {
        method: 'POST',
        body: JSON.stringify({ limit: 10, query: naam.trim(), properties: ['name', 'zip', 'address'] }),
      },
    );
    results = data.results ?? [];
  } catch {
    return [];
  }

  const zip = postcode ? normalizeZip(postcode) : '';
  const nr = huisnummer(adres ?? undefined);
  const kandidaten: MatchKandidaat[] = [];

  for (const c of results) {
    const p = c.properties ?? {};
    if (!namesSimilar(p.name ?? '', naam)) continue;
    let score = 60;
    let reden = `Naam vergelijkbaar "${p.name ?? naam}"`;
    if (zip && p.zip && normalizeZip(p.zip) === zip) { score += 20; reden += ` + postcode ${p.zip}`; }
    else if (nr && p.address && huisnummer(p.address) === nr) { score += 10; reden += ' + huisnummer match'; }
    kandidaten.push({ id: c.id, naam: p.name ?? naam, reden, score });
  }

  return kandidaten.sort((a, b) => b.score - a.score).slice(0, 5);
}

