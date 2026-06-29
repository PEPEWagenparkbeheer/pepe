// Parseert een CarCollect "Facturatieverzoek"-mail (afzender noreply@carcollect.com) tot de
// gegevens die nodig zijn voor een auto-verkoopfactuur. CarCollect levert in de mailtekst alles
// kant-en-klaar aan: voertuig, koper (handelsrelatie) en de prijsopbouw (netto/btw/rest-bpm/
// administratiekosten/te betalen). We laten Claude (Haiku) de tekst gestructureerd uitlezen — dat
// is robuust tegen marge- vs btw-voertuigen en extra kostenregels die per mail kunnen verschillen.

import { extractJson } from '@/lib/llm/extractJson';
import { htmlNaarTekst } from '@/lib/htmlNaarTekst';

export interface CarCollectKoper {
  naam?: string | null;        // contactpersoon (t.a.v.)
  bedrijf?: string | null;     // handelsrelatie / debiteurnaam
  adres?: string | null;       // straat + huisnummer
  postcode?: string | null;
  plaats?: string | null;
  rdw_nummer?: string | null;
  btw_nummer?: string | null;
  email?: string | null;
  telefoon?: string | null;
}

export interface CarCollectExtraKost {
  omschrijving: string;
  bedrag_excl: number;
  btw: 'hoog' | 'geen';        // 21% of 0%
}

export interface CarCollectData {
  kenteken?: string | null;
  merk?: string | null;
  model?: string | null;       // model + uitvoering
  bouwjaar?: string | null;    // jaar of MM-YYYY
  vermogen_kw?: number | null;
  brandstof?: string | null;
  transmissie?: string | null;
  opties?: string | null;
  km_stand?: number | null;
  ingeleverd_op?: string | null; // DD-MM-YYYY
  vin?: string | null;

  koper: CarCollectKoper;

  btw_soort: 'btw' | 'marge';
  netto_excl?: number | null;       // voertuigprijs excl. btw (btw-voertuig) of margebedrag (marge)
  btw_bedrag?: number | null;       // btw over het voertuig
  rest_bpm?: number | null;         // rest-BPM (0% btw), indien aanwezig
  admin_kosten?: number | null;     // administratiekosten excl. btw
  te_betalen?: number | null;       // totaal incl. — controlebedrag

  extra_kosten?: CarCollectExtraKost[];
}

const SYSTEM = `Je bent een nauwkeurige extractie-assistent. Je krijgt de platte tekst van een
CarCollect "Facturatieverzoek"-e-mail. Haal hieruit UITSLUITEND geldige JSON volgens dit schema
(geen uitleg, geen markdown):

{
  "kenteken": string|null,            // bv "V802ZZ", zonder streepjes
  "merk": string|null,                // bv "Peugeot"
  "model": string|null,               // model + uitvoering, bv "Partner 1.6 BlueHDI Premium"
  "bouwjaar": string|null,            // jaar zoals in de mail, bv "2019"
  "vermogen_kw": number|null,         // kW als getal, bv 55
  "brandstof": string|null,           // bv "Diesel"
  "transmissie": string|null,         // bv "Handgeschakeld"
  "opties": string|null,              // de optie-opsomming als één string
  "km_stand": number|null,            // definitieve kilometerstand als getal
  "ingeleverd_op": string|null,       // DD-MM-YYYY
  "vin": string|null,                 // VIN-/chassisnummer
  "koper": {
    "naam": string|null,              // contactpersoon
    "bedrijf": string|null,           // handelsrelatie / bedrijfsnaam
    "adres": string|null,             // ALLEEN straat + huisnummer, bv "Tarasconweg 15"
    "postcode": string|null,          // bv "5627 GB"
    "plaats": string|null,            // bv "Eindhoven"
    "rdw_nummer": string|null,
    "btw_nummer": string|null,
    "email": string|null,
    "telefoon": string|null
  },
  "btw_soort": "btw"|"marge",         // "Het betreft een BTW voertuig" -> "btw"; "marge voertuig" -> "marge"
  "netto_excl": number|null,          // voertuig "Netto (Excl. BTW)" als getal; bij marge het margebedrag
  "btw_bedrag": number|null,          // btw over het voertuig
  "rest_bpm": number|null,            // rest-BPM indien vermeld, anders null
  "admin_kosten": number|null,        // "Administratiekosten" EXCL btw als getal
  "te_betalen": number|null,          // "Te betalen" totaal incl. btw als getal
  "extra_kosten": [ { "omschrijving": string, "bedrag_excl": number, "btw": "hoog"|"geen" } ]
}

REGELS:
- Bedragen zijn getallen (geen valutateken, geen duizendscheiding). Nederlandse notatie: "2920.00" -> 2920, "3.533,20" -> 3533.20.
- "Adres" splitsen: het ADRES-veld bevat alleen straat + huisnummer; postcode en plaats apart.
- Neem GEEN waarden over uit voorbeeld-/handtekeningtekst (CarCollect contactgegevens, "Perke Pellis", support@carcollect.com horen NIET bij de koper).
- Als rest-BPM of extra kosten ontbreken: rest_bpm = null en extra_kosten = [].
- Antwoord met UITSLUITEND het JSON-object.`;

/** Parseert de (platte of HTML-)mailtekst van een CarCollect-facturatieverzoek. */
export async function parseCarCollectMail(body: string, isHtml = false): Promise<CarCollectData | null> {
  const tekst = isHtml ? htmlNaarTekst(body) : body;
  // Strip tracking-URL's zodat de extractie zich op de inhoud richt.
  const schoon = tekst
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const data = await extractJson<CarCollectData>(SYSTEM, schoon, { maxTokens: 1500 });
  if (!data) return null;
  if (!data.koper) data.koper = {};
  if (!data.btw_soort) data.btw_soort = 'btw';
  if (!Array.isArray(data.extra_kosten)) data.extra_kosten = [];
  if (data.kenteken) data.kenteken = data.kenteken.replace(/[-\s]/g, '').toUpperCase();
  return data;
}
