// Extraheert factuur-velden uit ruwe PDF-tekst via Claude (Anthropic, Haiku 4.5).
// Server-only. Werkt zonder voorbeeld-PDF op het juiste pakket; bij
// nieuwe layouts hoeft alleen de prompt te worden bijgesteld.

import { extractJson } from '@/lib/llm/extractJson';

export interface FactuurExtract {
  factuurnummer?: string | null;
  factuurdatum?: string | null;        // ISO yyyy-mm-dd
  kenteken?: string | null;
  bedrijfsnaam?: string | null;
  kvk?: string | null;
  is_bedrijf?: boolean;                // true = zakelijk, false = particulier
  berijder_naam?: string | null;
  berijder_email?: string | null;
  bedrag_excl_btw?: number | null;
  bedrag_incl_btw?: number | null;
  straat?: string | null;              // "Torenbaan 123"
  postcode?: string | null;            // "4726 AW"
  plaats?: string | null;              // "Cruquius"
  land?: string | null;                // "Nederland"
  is_auto_factuur?: boolean;
}

// PEPE's eigen bedrijfsdetails — moeten NOOIT als klantdata terugkomen.
// Twinfield-template print de KvK soms met een typo (88528502), dus filter
// alles wat met de eerste 7 cijfers begint.
const PEPE_KVK_PREFIX = '8852850';
const PEPE_NAAM_MATCH = /pepe\s*wagenparkbeheer/i;

const SYSTEM_PROMPT = `Je extraheert factuurgegevens uit (Nederlandse) verkoopfactuur-PDF tekst voor autohandelaar PEPE Wagenparkbeheer.

LAYOUT VAN DE PDF:
- LINKS-BOVEN staat een KLANT-blok van 3-5 regels onder elkaar:
    [Bedrijfsnaam of persoonsnaam]
    [Straat huisnummer]
    [Postcode plaats]
    [Land]
  ALLE klantvelden (bedrijfsnaam, straat, postcode, plaats, land) komen HIER vandaan.
- RECHTS-BOVEN staat een PEPE/header-blok met telefoonnummer, e-mail, website,
  PEPE-adres, KvK, BTW, IBAN. Dit is PEPE's eigen administratie. NEEM HIER NIETS UIT.
- DAARONDER staat een gele/oranje strook met factuur-meta (factuurnummer, datum, vervaldatum).
- DAARONDER staat het kenteken, km-stand, autodetails.

LET OP — PEPE-gegevens NOOIT teruggeven als klant-data:
- PEPE Wagenparkbeheer, KvK 88528503 (kan met typo 88528502 staan), BTW NL864470114B01
- adres De Garven 19, 6713 TV Oudenbosch
- iban NL02INGB0106922696
- info@pepewagenparkbeheer.nl, 0165 794 100
Als de enige KvK die je vindt in/bij de PEPE-header staat: kvk = null.
Klant-KvK staat ALLEEN als het in het LINKER klant-blok geschreven is.

Retourneer ALLEEN geldige JSON met deze velden (null als niet duidelijk):
- factuurnummer: het factuurnummer (string)
- factuurdatum: factuurdatum in ISO-formaat "yyyy-mm-dd"
- kenteken: Nederlands kenteken zoals "AB-123-C" of "12-AB-34" — geef terug zonder streepjes en in HOOFDLETTERS (bijv. "AB123C")
- bedrijfsnaam: naam van de klant zoals op de factuur staat. Als de klant een PERSOON is zonder bedrijfsvorm (geen B.V./V.O.F./N.V./eenmanszaak/handelsnaam), zet bedrijfsnaam dan op die persoonsnaam EN is_bedrijf=false.
- kvk: KvK-nummer van de KLANT (8 cijfers). NOOIT 88528503 (=PEPE). null als geen klant-KvK genoemd.
- is_bedrijf: true als de klant een zakelijke entiteit is (naam bevat B.V., V.O.F., N.V., GmbH, Holding, Beheer, Bemiddeling, Trading, of er staat een KvK-nummer bij de klant). false als het een particulier is (alleen voor- en achternaam, geen bedrijfssuffix, geen KvK).
- berijder_naam: persoonsnaam van de berijder/contactpersoon (NIET PEPE-medewerker). Bij particulier: zelfde als bedrijfsnaam.
- berijder_email: e-mail van de berijder/klant
- bedrag_excl_btw: totaalbedrag excl. BTW als number (puur getal, geen valutateken, punt voor decimalen)
- bedrag_incl_btw: totaalbedrag incl. BTW als number
- straat: factuuradres van de KLANT — straat + huisnummer (bijv. "Torenbaan 123")
- postcode: postcode van de klant in NL-formaat "1234 AB" (4 cijfers, spatie, 2 letters hoofdletters)
- plaats: woonplaats/vestigingsplaats van de klant
- land: land van de klant (default "Nederland" bij NL adres)
- is_auto_factuur: true als de factuur over een auto/voertuig gaat

Belangrijk:
- Bedragen: "€ 1.250,00" → 1250.00. Komma → punt, honderdtallen-scheiding weglaten.
- Bij onduidelijkheid: null. NIET raden.`;

export async function parseFactuurTekst(tekst: string): Promise<FactuurExtract | null> {
  // Limiteer input zodat het context-window niet wordt overschreden.
  // Een factuur is doorgaans <8k chars; we kappen op 20k voor zekerheid.
  const input = tekst.slice(0, 20_000);

  try {
    const obj = await extractJson<FactuurExtract>(SYSTEM_PROMPT, input, { maxTokens: 800 });
    if (!obj) return null;

    // Veiligheidsfilter: als Groq toch PEPE-data heeft teruggegeven, wegfilteren.
    const kvk = obj.kvk?.replace(/\D/g, '') ?? null;
    const veiligKvk = kvk && !kvk.startsWith(PEPE_KVK_PREFIX) ? kvk : null;
    const bedrijfsnaam = obj.bedrijfsnaam && !PEPE_NAAM_MATCH.test(obj.bedrijfsnaam)
      ? obj.bedrijfsnaam
      : null;

    // Fallback voor is_bedrijf indien Groq het niet zette:
    // particulier = bedrijfsnaam == berijder_naam EN geen bedrijfssuffix EN geen KvK.
    const heeftBedrijfSuffix = bedrijfsnaam
      ? /\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?|gmbh|holding|beheer|bemiddeling|trading|maatschap|stichting)\b/i.test(bedrijfsnaam)
      : false;
    const is_bedrijf = typeof obj.is_bedrijf === 'boolean'
      ? obj.is_bedrijf
      : Boolean(heeftBedrijfSuffix || veiligKvk);

    return {
      factuurnummer: obj.factuurnummer ?? null,
      factuurdatum: normaliseerDatum(obj.factuurdatum),
      kenteken: obj.kenteken ? obj.kenteken.replace(/[-\s]/g, '').toUpperCase() : null,
      bedrijfsnaam,
      kvk: veiligKvk,
      is_bedrijf,
      berijder_naam: obj.berijder_naam ?? null,
      berijder_email: obj.berijder_email ?? null,
      bedrag_excl_btw: typeof obj.bedrag_excl_btw === 'number' ? obj.bedrag_excl_btw : null,
      bedrag_incl_btw: typeof obj.bedrag_incl_btw === 'number' ? obj.bedrag_incl_btw : null,
      straat: obj.straat ?? null,
      postcode: obj.postcode ? obj.postcode.toUpperCase().replace(/\s+/g, ' ').trim() : null,
      plaats: obj.plaats ?? null,
      land: obj.land ?? null,
      is_auto_factuur: obj.is_auto_factuur ?? false,
    };
  } catch (e) {
    console.error('factuur-parser exception:', e);
    return null;
  }
}

// Accepteer "2026-05-22", "22-05-2026", "22/05/2026", "22-5-26" → ISO.
function normaliseerDatum(d?: string | null): string | null {
  if (!d) return null;
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 70 ? '19' : '20') + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}
