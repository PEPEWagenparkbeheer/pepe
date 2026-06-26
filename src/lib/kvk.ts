// KVK Handelsregister API — basisprofielen ophalen op KVK-nummer.
// Vereist: KVK_API_KEY in .env.local (aanvragen via developers.kvk.nl)
// Productie: https://api.kvk.nl/api/v1/basisprofielen/{kvkNummer}
// Test:      https://api.kvk.nl/test/api/v1/basisprofielen/{kvkNummer}  (key: l7xx1f2691f2520d487b902f4e0b57a0b197)

const KVK_BASE = process.env.KVK_API_URL ?? 'https://api.kvk.nl/api/v1';

export interface KvkBedrijf {
  kvkNummer: string;
  naam: string;
  website?: string;   // hostname zonder www, bijv. "pepe.nl"
  straat?: string;    // "Keizersgracht 123" (gecombineerd)
  postcode?: string;  // "1017 EJ"
  plaats?: string;
  land?: string;      // "Nederland"
}

type KvkAdres = {
  type?: string;
  straatnaam?: string;
  huisnummer?: number;
  huisletter?: string;
  huisnummerToevoeging?: string;
  postcode?: string;
  plaats?: string;
  land?: string;
  indAfgeschermd?: string;
};

type KvkHoofdvestiging = {
  eersteHandelsnaam?: string;
  adressen?: KvkAdres[];
  websites?: string[];
};

type KvkResponse = {
  kvkNummer?: string;
  naam?: string;
  // De KVK-basisprofiel-API levert de hoofdvestiging onder _embedded (niet top-level).
  _embedded?: { hoofdvestiging?: KvkHoofdvestiging };
  hoofdvestiging?: KvkHoofdvestiging;
};

export async function kvkOpzoeken(kvkNummer: string): Promise<KvkBedrijf | null> {
  const apiKey = process.env.KVK_API_KEY?.trim();
  if (!apiKey) return null;

  const kvk = kvkNummer.replace(/\D/g, '');
  if (kvk.length !== 8) return null;

  try {
    const res = await fetch(`${KVK_BASE}/basisprofielen/${kvk}`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const d = (await res.json()) as KvkResponse;
    const hv = d._embedded?.hoofdvestiging ?? d.hoofdvestiging;

    // Bezoekadres heeft prioriteit, afgeschermde adressen overslaan
    const adressen = hv?.adressen ?? [];
    const adres =
      adressen.find((a) => a.type === 'bezoekadres' && a.indAfgeschermd !== 'Ja') ??
      adressen.find((a) => a.indAfgeschermd !== 'Ja') ??
      adressen[0];

    let straat: string | undefined;
    if (adres?.straatnaam) {
      straat = [
        adres.straatnaam,
        adres.huisnummer,
        adres.huisletter,
        adres.huisnummerToevoeging,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
    }

    const rawSite = hv?.websites?.[0];
    let website: string | undefined;
    if (rawSite) {
      try {
        const url = new URL(rawSite.startsWith('http') ? rawSite : `https://${rawSite}`);
        website = url.hostname.replace(/^www\./, '');
      } catch {
        // ongeldige URL — negeren
      }
    }

    return {
      kvkNummer: d.kvkNummer ?? kvk,
      naam: d.naam ?? hv?.eersteHandelsnaam ?? '',
      website,
      straat,
      postcode: adres?.postcode,
      plaats: adres?.plaats,
      land: adres?.land,
    };
  } catch {
    return null;
  }
}
