// Analyseert een buitenlands toestandsrapport (PDF) via Claude document-blocks.
// Server-only — nooit in client-bundle importeren.

import Anthropic from '@anthropic-ai/sdk';
import type { RapportBijzonderheid } from '@/types';

const MODEL = 'claude-sonnet-4-6';

export interface AnalyseResultaat {
  merk?: string;
  model?: string;
  kenteken?: string;
  km_stand?: string;
  conclusie?: string;
  bijzonderheden: RapportBijzonderheid[];
}

const SYSTEM_PROMPT = `Je bent een auto-inkoopexpert die een buitenlands toestandsrapport (Zustandsbericht) beoordeelt voor inkoop voor PEPE Wagenparkbeheer.

Analyseer het rapport en beoordeel ALTIJD de volgende 7 punten. Elk punt krijgt een status (goed/let_op/slecht/onbekend) en een korte uitleg van een regel:

1. schade - Let EXPLICIET op HAGELSCHADE (vaak weggestopt in tekst, foto's of schadediagram). Ook deuken, krassen, laakschade.
2. geur - Rook, schimmel, dieren, vocht. Indien niet vermeld: onbekend.
3. onderhoud - Datum en km van laatste onderhoudsbeurt, onderhoudshistorie aanwezig/niet.
4. banden - Profieldiepte en conditie. Indien niet vermeld: onbekend.
5. winterbanden - Zijn er winterbanden of een extra set bij? Ja/nee.
6. technisch - Mankementen, foutmeldingen, motor/transmissie/elektrisch.
7. schadeverleden - Eerdere schades, bij voorkeur bedrag in euro's.

Geef ook: merk, model, kenteken, km-stand indien herkenbaar in het rapport.
Schrijf een conclusie van 1-2 zinnen met koopadvies of waarschuwing.

Retourneer UITSLUITEND geldige JSON zonder markdown of uitleg:
{"merk":"...","model":"...","kenteken":"...","km_stand":"...","conclusie":"...","bijzonderheden":[{"sleutel":"schade","label":"Schade","status":"goed","tekst":"..."},{"sleutel":"geur","label":"Geur","status":"onbekend","tekst":"..."},{"sleutel":"onderhoud","label":"Onderhoud","status":"goed","tekst":"..."},{"sleutel":"banden","label":"Banden","status":"goed","tekst":"..."},{"sleutel":"winterbanden","label":"Winterbanden","status":"onbekend","tekst":"..."},{"sleutel":"technisch","label":"Technisch","status":"goed","tekst":"..."},{"sleutel":"schadeverleden","label":"Schadeverleden","status":"onbekend","tekst":"..."}]}`;

export async function analyseerToestandsrapport(base64Pdf: string): Promise<AnalyseResultaat> {
  const client = new Anthropic();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64Pdf,
      },
    },
    {
      type: 'text',
      text: 'Analyseer dit toestandsrapport en geef de JSON-output zoals beschreven.',
    },
  ];

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

  // Robuuste JSON-parse: strip ```json ... ``` en zoek eerste {...}
  let jsonStr = raw;
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) jsonStr = match[0];

  try {
    const parsed = JSON.parse(jsonStr) as Partial<AnalyseResultaat>;
    return {
      merk: parsed.merk,
      model: parsed.model,
      kenteken: parsed.kenteken,
      km_stand: parsed.km_stand,
      conclusie: parsed.conclusie,
      bijzonderheden: Array.isArray(parsed.bijzonderheden) ? parsed.bijzonderheden : [],
    };
  } catch {
    return {
      conclusie: 'Analyse mislukt - kon JSON niet verwerken.',
      bijzonderheden: [],
    };
  }
}