// HubSpot client voor PEPE Flow.
// Server-only. Gebaseerd op tsd-dashboard/src/lib/hubspot.ts, uitgebreid
// met search+create voor Company, Contact en Deal zodat de facturen-inbox
// klanten en auto's kan aanmaken die nog niet in HubSpot staan.

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

export async function createCompany(input: CompanyInput): Promise<string> {
  const properties: Record<string, string> = { name: input.name };
  if (input.kvk) properties.kvk_nummer = input.kvk;
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

// ── Contact ─────────────────────────────────────────────────────

export interface ContactInput {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
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

  const data = await hsFetch<{ id: string }>(
    `${HS_BASE}/crm/v3/objects/contacts`,
    { method: 'POST', body: JSON.stringify({ properties }) },
  );
  return data.id;
}

// ── Deal (= auto, dealname = kenteken) ──────────────────────────

export interface DealInput {
  kenteken: string;
  merk_type?: string;
  brandstof?: string;
  type_voertuig?: string;
  inzetdatum?: string;   // ISO yyyy-mm-dd
  apk_datum?: string;    // ISO yyyy-mm-dd
  kilometerstand_huidig?: number;
  dealstage?: string;
  pipeline?: string;
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

export async function createDeal(input: DealInput): Promise<string> {
  const properties: Record<string, string> = {
    dealname: input.kenteken.replace(/\s+/g, '').toUpperCase(),
    dealstage: input.dealstage ?? DEALSTAGE_VERKOCHT,
  };
  if (input.pipeline) properties.pipeline = input.pipeline;
  if (input.merk_type) properties.merk___type = input.merk_type;
  if (input.brandstof) properties.brandstof = input.brandstof;
  if (input.type_voertuig) properties.type_voertuig = input.type_voertuig;
  if (input.inzetdatum) properties.inzetdatum = input.inzetdatum;
  if (input.apk_datum) properties.apk_datum = input.apk_datum;
  if (input.kilometerstand_huidig != null) {
    properties.kilometerstand_huidig = String(input.kilometerstand_huidig);
  }

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
