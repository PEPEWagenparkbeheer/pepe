// src/lib/brein/inzetdocument.ts
// Extraheert alle relevante gegevens uit een inzetdocument-mail via Claude.
// Haalt contractdetails, berijdergegevens, bedrijfgegevens en leasemaatschappij op.
// Server-only.

import { extractJson } from '@/lib/llm/extractJson';

export interface InzetdocumentExtract {
  // Voertuig & contract
  kenteken: string | null;
  merk_model: string | null;
  brandstof: string | null;
  fiscale_waarde: number | null;
  contractnummer: string | null;
  inzetdatum: string | null;          // ISO yyyy-mm-dd
  looptijd_maanden: number | null;
  jaarkilometrage: number | null;
  type_aanschaf: string | null;       // "Operational Lease" | "Finance Lease" | "Eigendom"

  banden: string | null;              // "Zomer" | "Winter" | "All season"

  // Berijder
  berijder_voornaam: string | null;
  berijder_achternaam: string | null;
  berijder_email: string | null;
  berijder_telefoon: string | null;
  berijder_adres: string | null;
  berijder_postcode: string | null;
  berijder_stad: string | null;

  // Bedrijf (werkgever berijder)
  bedrijf_naam: string | null;
  bedrijf_adres: string | null;
  bedrijf_postcode: string | null;
  bedrijf_stad: string | null;
  bedrijf_kvk: string | null;

  // Leasemaatschappij
  leasemaatschappij_naam: string | null;
  leasemaatschappij_referentie: string | null;
  leasemaatschappij_contactpersoon: string | null;
  leasemaatschappij_email: string | null;
  leasemaatschappij_telefoon: string | null;
}

const SYSTEM_PROMPT = `Je extraheert gestructureerde gegevens uit inzetdocumenten en contractmails voor wagenparkbeheerder PEPE.
Retourneer ALLEEN geldige JSON, geen uitleg, geen markdown.

Extraheer alle beschikbare velden. Zet ontbrekende velden op null.
Datums formatteer je als "yyyy-mm-dd". Fiscale waarde is een getal (geen euro-teken).
Looptijd in hele maanden. Jaarkilometrage als getal (geen "km").
Kenteken zonder spaties en koppeltekens, in hoofdletters (bijv. "AB123CD").

JSON-structuur:
{
  "kenteken": string|null,
  "merk_model": string|null,
  "brandstof": string|null,
  "fiscale_waarde": number|null,
  "contractnummer": string|null,
  "inzetdatum": "yyyy-mm-dd"|null,
  "looptijd_maanden": number|null,
  "jaarkilometrage": number|null,
  "type_aanschaf": "Operational Lease"|"Finance Lease"|"Eigendom"|null,
  "banden": "Zomer"|"Winter"|"All season"|null,
  "berijder_voornaam": string|null,
  "berijder_achternaam": string|null,
  "berijder_email": string|null,
  "berijder_telefoon": string|null,
  "berijder_adres": string|null,
  "berijder_postcode": string|null,
  "berijder_stad": string|null,
  "bedrijf_naam": string|null,
  "bedrijf_adres": string|null,
  "bedrijf_postcode": string|null,
  "bedrijf_stad": string|null,
  "bedrijf_kvk": string|null,
  "leasemaatschappij_naam": string|null,
  "leasemaatschappij_referentie": string|null,
  "leasemaatschappij_contactpersoon": string|null,
  "leasemaatschappij_email": string|null,
  "leasemaatschappij_telefoon": string|null
}`;

export async function extraheertInzetdocument(
  onderwerp: string,
  bodyTekst: string,
): Promise<InzetdocumentExtract> {
  const prompt = `Onderwerp: ${onderwerp}\n\n${bodyTekst}`;
  const result = await extractJson<InzetdocumentExtract>(SYSTEM_PROMPT, prompt);
  return result ?? {
    kenteken: null, merk_model: null, brandstof: null, fiscale_waarde: null,
    contractnummer: null, inzetdatum: null, looptijd_maanden: null, jaarkilometrage: null,
    type_aanschaf: null, banden: null,
    berijder_voornaam: null, berijder_achternaam: null, berijder_email: null,
    berijder_telefoon: null, berijder_adres: null, berijder_postcode: null, berijder_stad: null,
    bedrijf_naam: null, bedrijf_adres: null, bedrijf_postcode: null, bedrijf_stad: null, bedrijf_kvk: null,
    leasemaatschappij_naam: null, leasemaatschappij_referentie: null,
    leasemaatschappij_contactpersoon: null, leasemaatschappij_email: null,
    leasemaatschappij_telefoon: null,
  };
}
