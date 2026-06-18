// src/lib/brein/classifier.ts
// Classificeert BREIN-mailberichten met Claude (Anthropic):
// - categorie (factuur | kenteken | verkoop | vraag | overig)
// - samenvatting (max 2 zinnen NL)
// - prioriteit (laag | normaal | hoog | urgent)
// - kenteken (geëxtraheerd uit onderwerp/body)
// Server-only – gebruik uitsluitend in API routes of server actions.

import Anthropic from '@anthropic-ai/sdk';

// Haiku is ruim voldoende voor simpele classificatie (categorie + samenvatting);
// de concept-generatie draait bewust op Opus voor de beste NL toon (zie concept.ts).
const MODEL = 'claude-haiku-4-5';

export type BreinCategorie = 'factuur' | 'kenteken' | 'verkoop' | 'vraag' | 'overig';
export type BreinPrioriteit = 'laag' | 'normaal' | 'hoog' | 'urgent';

export interface ClassifyResult {
  categorie: BreinCategorie;
  prioriteit: BreinPrioriteit;
  samenvatting: string;
  kenteken: string | null;
}

interface BerichtInput {
  onderwerp: string | null;
  afzender_naam: string | null;
  afzender_email: string | null;
  body_preview: string | null;
}

// ── Kenteken-regex (alle Nederlandse zijcodes) ────────────────────────────
// Dekt: XX-99-XX, 99-XX-99, XX-XX-99, 99-XX-XX, XX-999-X, X-999-XX,
//       99-99-XX, XX-99-99, 9-XX-999, 999-XX-9, X-99-XXX, XXX-99-X
const KENTEKEN_REGEX = /\b([A-Z]{1,3}-[0-9]{1,3}-[A-Z0-9]{1,3}|[0-9]{1,2}-[A-Z]{2,3}-[0-9]{1,3})\b/gi;

/** Probeert een kenteken uit tekst te extraheren via regex (geen LLM-call). */
export function extractKentekenRegex(tekst: string): string | null {
  const normalized = tekst.toUpperCase().replace(/\s+/g, ' ');
  const match = normalized.match(KENTEKEN_REGEX);
  if (!match) return null;
  return match[0].toUpperCase();
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY ontbreekt in omgevingsvariabelen');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const SYSTEM_PROMPT = `Je bent een e-mailclassificator voor PEPE Wagenparkbeheer, een leasemaatschappij.
Analyseer inkomende e-mails en retourneer uitsluitend geldige JSON (geen markdown, geen uitleg).

Categorieën:
- "factuur": factuur, nota, rekening, betaling, creditnota, aanmaning
- "kenteken": vraag/info over een specifiek voertuig of kenteken (APK, schade, kilometerstand, defect)
- "verkoop": offerte, nieuwe auto, verkoop, aanschaf, aanbod
- "vraag": algemene servicevraag of klantvraag die niet past in bovenstaande
- "overig": nieuwsbrief, spam, automatisch bericht, out-of-office, niet-relevant

Prioriteit:
- "urgent": juridisch, aanmaning, schade, deadline vandaag/morgen, APK verlopen
- "hoog": deadline komende week, klacht, incident
- "normaal": gewone correspondentie
- "laag": informatie, nieuwsbrief, bevestiging

JSON-formaat (exact dit schema, geen andere velden):
{"categorie":"factuur","prioriteit":"normaal","samenvatting":"Factuur ontvangen van Supplier X voor kenteken AB-123-C. Bedrag €450.","kenteken":"AB-123-C"}
Als er geen kenteken is, gebruik "kenteken":null.
Schrijf de samenvatting in het Nederlands, max 2 zinnen.
Retourneer ALLEEN JSON, geen uitleg, geen markdown code blocks.`;

/**
 * Classificeert één bericht met Claude (Anthropic).
 * Probeert eerst kenteken via regex; als dat niets geeft, vraagt LLM erom.
 */
export async function classifyBericht(bericht: BerichtInput): Promise<ClassifyResult> {
  const tekst = [bericht.onderwerp ?? '', bericht.body_preview ?? ''].join('\n').trim();

  // Regex-first voor kenteken (goedkoper, sneller)
  const kentekenViaRegex = extractKentekenRegex(
    [bericht.onderwerp ?? '', bericht.body_preview ?? ''].join(' ')
  );

  const prompt = `Afzender: ${bericht.afzender_naam ?? ''} <${bericht.afzender_email ?? ''}>
Onderwerp: ${bericht.onderwerp ?? '(geen)'}
Preview: ${(bericht.body_preview ?? '').slice(0, 600)}`;

  const client = getClient();
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw =
    completion.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ??
    '{}';

  // Strip markdown code blocks if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: Partial<ClassifyResult>;
  try {
    parsed = JSON.parse(cleaned) as Partial<ClassifyResult>;
  } catch {
    console.warn('[brein/classifier] Kon JSON niet parsen:', raw.slice(0, 200));
    parsed = {};
  }

  const GELDIGE_CATEGORIEEN: BreinCategorie[] = ['factuur', 'kenteken', 'verkoop', 'vraag', 'overig'];
  const GELDIGE_PRIORITEITEN: BreinPrioriteit[] = ['laag', 'normaal', 'hoog', 'urgent'];

  return {
    categorie: GELDIGE_CATEGORIEEN.includes(parsed.categorie as BreinCategorie)
      ? (parsed.categorie as BreinCategorie)
      : 'overig',
    prioriteit: GELDIGE_PRIORITEITEN.includes(parsed.prioriteit as BreinPrioriteit)
      ? (parsed.prioriteit as BreinPrioriteit)
      : 'normaal',
    samenvatting: typeof parsed.samenvatting === 'string'
      ? parsed.samenvatting.slice(0, 500)
      : tekst.slice(0, 200),
    // Regex wint van LLM als het iets gevonden heeft (betrouwbaarder)
    kenteken: kentekenViaRegex ?? (typeof parsed.kenteken === 'string' ? parsed.kenteken : null),
  };
}