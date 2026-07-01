// Parseert een Belastingdienst "betaalbericht voor de rest-BPM"-mail (info@-inbox) tot het
// chassisnummer en het te betalen rest-BPM-bedrag. Claude (Haiku) leest de tekst gestructureerd
// uit — robuust tegen wisselende opmaak van de Belastingdienst-berichten.

import { extractJson } from '@/lib/llm/extractJson';
import { htmlNaarTekst } from '@/lib/htmlNaarTekst';

export interface BpmBerichtData {
  chassis?: string | null;   // VIN/chassisnummer waar het bericht over gaat
  rest_bpm?: number | null;  // te betalen rest-BPM-bedrag
  kenmerk?: string | null;   // betaalkenmerk (indien vermeld)
}

const SYSTEM = `Je bent een nauwkeurige extractie-assistent. Je krijgt de platte tekst van een
e-mail van de Nederlandse Belastingdienst: een betaalbericht voor de rest-BPM na goedkeuring van
een BPM-aangifte voor een geïmporteerd voertuig. Haal hieruit UITSLUITEND geldige JSON volgens dit
schema (geen uitleg, geen markdown):

{
  "chassis": string|null,   // het volledige chassis-/VIN-nummer waar het bericht over gaat
  "rest_bpm": number|null,  // het te betalen (rest-)BPM-bedrag als getal
  "kenmerk": string|null    // het betalingskenmerk indien vermeld, anders null
}

REGELS:
- Bedragen zijn getallen zonder valutateken of duizendscheiding. Nederlandse notatie: "3.533,20" -> 3533.20, "2920,00" -> 2920.
- Het chassisnummer is een reeks van doorgaans 17 tekens (letters+cijfers), zonder spaties.
- Als een veld ontbreekt: null.
- Antwoord met UITSLUITEND het JSON-object.`;

export async function parseBpmBericht(body: string, isHtml = false): Promise<BpmBerichtData | null> {
  const tekst = isHtml ? htmlNaarTekst(body) : body;
  const schoon = tekst
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const data = await extractJson<BpmBerichtData>(SYSTEM, schoon, { maxTokens: 500 });
  if (!data) return null;
  if (data.chassis) data.chassis = data.chassis.replace(/[-\s]/g, '').toUpperCase();
  return data;
}
