// Extraheert gestructureerde kosten-regels uit een werkplaatsfactuur.
// Elke rij is één werkzaamheid zodat aggregatie per kenteken mogelijk is.
// Server-only.
import { extractJson } from '@/lib/llm/extractJson';

export interface AutokostenRegel {
  omschrijving: string;
  categorie: 'onderhoud' | 'banden' | 'remmen' | 'apk' | 'schade' | 'olie' | 'overig';
  bedrag: number;   // excl. btw
  aantal: number;
}

export interface AutokostenExtract {
  kenteken: string | null;
  garage_naam: string | null;
  factuurdatum: string | null;   // ISO yyyy-mm-dd
  factuurnummer: string | null;
  bedrag_excl_btw: number | null;
  bedrag_incl_btw: number | null;
  regels: AutokostenRegel[];
}

const SYSTEM_PROMPT = `Je extraheert gestructureerde gegevens uit werkplaatsfacturen voor wagenparkbeheerder PEPE.
Retourneer ALLEEN geldige JSON, geen uitleg, geen markdown.

Extraheer elke aparte werkzaamheid of onderdeel als een eigen "regel".
Zet ontbrekende velden op null. Datums als "yyyy-mm-dd". Bedragen als getal excl. btw.
Kenteken zonder spaties, in hoofdletters (bijv. "AB123CD").

Categorie-keuzes per werkzaamheid:
- "onderhoud": beurten, filters, vloeistoffen, algemeen onderhoud
- "banden": banden monteren, balanceren, bandenwissel
- "remmen": remblokken, remschijven, remvloeistof
- "apk": APK-keuring
- "schade": herstel van carrosserie-, glas- of andere schade
- "olie": olie, olie-filter, oliewissel
- "overig": alles wat niet in bovenstaande past

JSON-structuur:
{
  "kenteken": string|null,
  "garage_naam": string|null,
  "factuurdatum": "yyyy-mm-dd"|null,
  "factuurnummer": string|null,
  "bedrag_excl_btw": number|null,
  "bedrag_incl_btw": number|null,
  "regels": [
    {
      "omschrijving": string,
      "categorie": "onderhoud"|"banden"|"remmen"|"apk"|"schade"|"olie"|"overig",
      "bedrag": number,
      "aantal": number
    }
  ]
}`;

export async function extraheertAutokosten(
  onderwerp: string,
  bodyTekst: string,
): Promise<AutokostenExtract> {
  const prompt = `Onderwerp: ${onderwerp}\n\n${bodyTekst}`;
  const result = await extractJson<AutokostenExtract>(SYSTEM_PROMPT, prompt, { maxTokens: 1500 });
  return result ?? {
    kenteken: null,
    garage_naam: null,
    factuurdatum: null,
    factuurnummer: null,
    bedrag_excl_btw: null,
    bedrag_incl_btw: null,
    regels: [],
  };
}
