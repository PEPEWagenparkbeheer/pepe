// Classificeert inkomende documenten (PDF-tekst + onderwerp) naar een van de
// vier Documentenstroom-types. Server-only.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5';

export type Documenttype = 'factuur' | 'bestelbevestiging' | 'inzetbevestiging' | 'autokosten';

export interface ClassifyDocumentResult {
  documenttype: Documenttype;
  vertrouwen: number;
  kenteken: string | null;
}

const KENTEKEN_REGEXES = [
  /\b[A-Z]{2}\d{4}\b/,
  /\b\d{4}[A-Z]{2}\b/,
  /\b\d{2}[A-Z]{2}\d{2}\b/,
  /\b[A-Z]{2}\d{2}[A-Z]{2}\b/,
  /\b[A-Z]\d{3}[A-Z]{2}\b/,
  /\b\d{3}[A-Z]{3}\b/,
];

function extractKenteken(tekst: string): string | null {
  const upper = tekst.toUpperCase();
  for (const re of KENTEKEN_REGEXES) {
    const m = upper.match(re);
    if (m) return m[0].replace(/[-\s]/g, '');
  }
  return null;
}

const SYSTEM_PROMPT = `Je classificeert een binnenkomend document als precies één van vier types voor PEPE Wagenparkbeheer.

Types:
- "inzetbevestiging": inzetdocument, inzetbevestiging, inzetformulier, huurovereenkomst, ingezet per datum, leasecontract berijder — ALTIJD met kenteken
- "bestelbevestiging": bestelbevestiging, orderbevestiging, auto in bestelling, contractbevestiging — NOOIT een kenteken, WEL een contractnummer/ordernummer
- "autokosten": werkplaatsfactuur, onderhoud, reparatie, APK, banden, remmen, werkzaamheden — afkomstig van een garage of werkplaats
- "factuur": verkoop factuur, nota, rekening, creditnota, aanmaning, betaling — standaard zakelijke factuur (fallback)

Retourneer uitsluitend geldige JSON zonder markdown:
{"documenttype":"...","vertrouwen":0.0}

vertrouwen: 0.0–1.0 (1.0 = volledig zeker)`;

export async function classifyDocument(
  onderwerp: string,
  pdfTekst: string,
): Promise<ClassifyDocumentResult> {
  const gecombineerd = `${onderwerp} ${pdfTekst}`;
  const kenteken = extractKenteken(gecombineerd);

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 80,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Onderwerp: ${onderwerp}\n\n${pdfTekst.slice(0, 4000)}` }],
    });

    const tekst = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
    const parsed = JSON.parse(tekst) as { documenttype?: string; vertrouwen?: number };

    const GELDIGE: Documenttype[] = ['factuur', 'bestelbevestiging', 'inzetbevestiging', 'autokosten'];
    const documenttype = GELDIGE.includes(parsed.documenttype as Documenttype)
      ? (parsed.documenttype as Documenttype)
      : 'factuur';

    return {
      documenttype,
      vertrouwen: typeof parsed.vertrouwen === 'number' ? parsed.vertrouwen : 0.5,
      kenteken,
    };
  } catch {
    return { documenttype: 'factuur', vertrouwen: 0, kenteken };
  }
}
