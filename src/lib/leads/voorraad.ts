// src/lib/leads/voorraad.ts
// Interim voorraad-check via de AutoScout24-dealerpagina (tot de Mobilox-koppeling er is).
// Leest de server-rendered __NEXT_DATA__ JSON van de dealerpagina en cachet 30 min
// in-memory, zodat we AutoScout niet bij elke concept-generatie raken. Server-only.

const DEALER_URL =
  process.env.AUTOSCOUT_DEALER_URL ||
  'https://www.autoscout24.nl/autobedrijven/pepe-wagenparkbeheer';
const TTL_MS = 30 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface VoorraadAuto {
  make: string;
  model: string;
  titel: string;
  url: string;
}

let _cache: { at: number; autos: VoorraadAuto[] } | null = null;

const norm = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Zoek de listings-array (elementen met een `vehicle`-veld) ergens in de __NEXT_DATA__-boom.
function findListings(o: unknown, depth = 0): Record<string, unknown>[] | null {
  if (!o || typeof o !== 'object' || depth > 9) return null;
  for (const v of Object.values(o as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'vehicle' in v[0]) {
      return v as Record<string, unknown>[];
    }
    if (v && typeof v === 'object') {
      const r = findListings(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function parsePagina(html: string): { autos: VoorraadAuto[]; totaal: number } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { autos: [], totaal: 0 };
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { autos: [], totaal: 0 };
  }
  const arr = findListings(data) ?? [];
  const autos = arr
    .map((l) => {
      const v = (l.vehicle ?? {}) as Record<string, string>;
      const titel = [v.make, v.model, v.modelVersionInput].filter(Boolean).join(' ');
      return {
        make: String(v.make ?? ''),
        model: String(v.model ?? ''),
        titel,
        url: l.url ? `https://www.autoscout24.nl${l.url}` : '',
      };
    })
    .filter((a) => a.make && a.model);
  const tot = m[1].match(/"numberOfResults"\s*:\s*(\d+)/);
  return { autos, totaal: tot ? Number(tot[1]) : autos.length };
}

async function fetchPagina(page: number): Promise<string> {
  const url = page > 1 ? `${DEALER_URL}?page=${page}` : DEALER_URL;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl;q=0.9', Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`AutoScout ${res.status}`);
  return res.text();
}

/** Haalt de actuele voorraad op (alle pagina's), met 30-min cache. */
export async function haalVoorraad(force = false): Promise<VoorraadAuto[]> {
  if (!force && _cache && Date.now() - _cache.at < TTL_MS) return _cache.autos;
  const autos: VoorraadAuto[] = [];
  for (let page = 1; page <= 6; page++) {
    const { autos: pagina, totaal } = parsePagina(await fetchPagina(page));
    if (pagina.length === 0) break;
    autos.push(...pagina);
    if (autos.length >= totaal) break;
  }
  _cache = { at: Date.now(), autos };
  return autos;
}

export interface BeschikbaarResultaat {
  beschikbaar: boolean;
  titel?: string;
  url?: string;
}

/**
 * Checkt of de auto van een lead nog in de AutoScout-voorraad staat (match op merk+model).
 * Bij twijfel/fout → { beschikbaar: false } (BREIN zegt dan "ik check even", nooit een valse claim).
 */
export async function isAutoBeschikbaar(autoTekst: string): Promise<BeschikbaarResultaat> {
  const lead = norm(autoTekst);
  if (!lead) return { beschikbaar: false };
  let autos: VoorraadAuto[];
  try {
    autos = await haalVoorraad();
  } catch {
    return { beschikbaar: false };
  }
  for (const a of autos) {
    const mm = norm(`${a.make} ${a.model}`);
    if (mm && (lead === mm || lead.startsWith(`${mm} `) || mm.startsWith(`${lead} `))) {
      return { beschikbaar: true, titel: a.titel, url: a.url };
    }
  }
  return { beschikbaar: false };
}
