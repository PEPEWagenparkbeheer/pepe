// src/lib/llm/extractJson.ts
// Gedeelde JSON-extractie met Claude (Anthropic). Vervangt de losse Groq-aanroepen
// voor gestructureerde extractie (leads, facturen, whatsapp). Haiku 4.5 is hiervoor
// ruim voldoende: goedkoop en snel. Server-only.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY ontbreekt in omgevingsvariabelen');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export interface ExtractJsonOpts {
  /** Max output tokens (default 2000). */
  maxTokens?: number;
}

/**
 * Vraagt Claude (Haiku 4.5) om uit `user` gestructureerde JSON te halen volgens de
 * instructies in `system`. De system-prompt MOET vragen om uitsluitend geldige JSON.
 * Retourneert het geparste object, of `null` als parsen mislukt.
 */
export async function extractJson<T = Record<string, unknown>>(
  system: string,
  user: string,
  opts: ExtractJsonOpts = {},
): Promise<T | null> {
  const client = getClient();
  const completion = await client.messages.create({
    model: MODEL,
    // Default ruim: het grootste schema (InzetdocumentExtract, 30 velden) wordt door
    // Haiku pretty-printed uitgevoerd en liep tegen de oude limiet van 500 aan, waardoor
    // de JSON mid-object werd afgekapt → parse-fout → null → all-null fallback.
    max_tokens: opts.maxTokens ?? 2000,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const raw =
    completion.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? '';
  if (!raw) return null;

  // Strip eventuele markdown code-fences.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Val terug op het eerste JSON-object/array in de tekst (voor het geval er
    // toch tekst omheen staat).
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        /* doorvallen naar warn */
      }
    }
    console.warn('[llm/extractJson] Kon JSON niet parsen:', raw.slice(0, 200));
    return null;
  }
}
