// src/lib/brein/concept.ts
// Genereert een concept-antwoord op een inkomende berijdersmail.
// Tone-of-voice: live meegegeven verzonden mails als stijlvoorbeeld (niet opgeslagen).
// Server-only — gebruik uitsluitend in API routes of server actions.
//
// ⚠️ TODO (later omzetten): dit draait nu op Groq (Llama 3.3) omdat het
// Anthropic-tegoed op was. Voor de beste Nederlandse toon hoort dit op
// Claude (Anthropic) te draaien — terugzetten zodra er Anthropic-tegoed is.
// Zie geheugen: werkend-voor-betaald.

import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

export interface ConceptInput {
  onderwerp: string | null;
  afzenderNaam: string | null;
  afzenderEmail: string | null;
  categorie: string | null;
  body: string; // platte tekst van de inkomende mail
  /** Recente verzonden mails als stijlvoorbeeld (subject + preview). */
  stijlvoorbeelden: { subject: string; bodyPreview: string }[];
  /** Optionele extra context (HubSpot/RDW), vrije tekst. */
  context?: string;
  /** PEPE-procedures/beslislogica die het antwoord inhoudelijk sturen. */
  procedures?: string;
}

let _client: Groq | null = null;
function getClient(): Groq {
  if (!_client) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY ontbreekt in omgevingsvariabelen');
    _client = new Groq({ apiKey: key });
  }
  return _client;
}

const SYSTEM_PROMPT = `Je bent de wagenparkbeheerder van PEPE Wagenparkbeheer en beantwoordt e-mails van berijders namens de mailbox fues@pepewagenparkbeheer.nl.

Je schrijft een CONCEPT-antwoord dat een medewerker daarna nakijkt en eventueel aanpast voordat het verstuurd wordt. Regels:
- VOLG ALTIJD de meegegeven PEPE-PROCEDURES. Die bepalen WAT je inhoudelijk antwoordt. Past de situatie bij een procedure, geef dan exact die actie — verzin NOOIT een eigen procedure of oplossing. (Voorbeeld: bij een geblokkeerde tankpas door 3x verkeerde pincode is het juiste antwoord 24 uur wachten tot automatische deblokkering — NIET een nieuwe pas bestellen.)
- Schrijf in het Nederlands.
- Neem de schrijfstijl, toon en aanhef over van de meegestuurde voorbeelden van eerder verzonden mails.
- Wees concreet en behulpzaam; verzin GEEN feiten, bedragen, data of toezeggingen die niet uit de mail of de context blijken.
- Als informatie ontbreekt om volledig te antwoorden, geef dan een net antwoord en markeer ontbrekende stukken met [TUSSEN HAAKJES] zodat de medewerker het kan invullen.
- Geen disclaimers over dat je een AI bent. Schrijf alsof jij de wagenparkbeheerder bent.
- BELANGRIJK: sluit af met de groet-regel (bijv. "Met vriendelijke groet,") en STOP daarna. Schrijf GEEN naam, functietitel, telefoonnummer, adres of logo — de vaste officiële handtekening wordt automatisch toegevoegd bij het versturen.
- Geef ALLEEN de tekst van het concept-antwoord terug (aanhef t/m de groet-regel), geen uitleg, geen onderwerp-regel.`;

/** Genereert een concept-antwoord. Geeft platte tekst terug. */
export async function genereerConcept(input: ConceptInput): Promise<string> {
  const voorbeelden = input.stijlvoorbeelden
    .slice(0, 8)
    .map((v, i) => `Voorbeeld ${i + 1} — onderwerp: ${v.subject}\n${v.bodyPreview}`)
    .join('\n\n---\n\n');

  const userContent = `${input.procedures ? `PEPE-PROCEDURES (volg deze EXACT voor de inhoud van je antwoord):\n${input.procedures}\n\n` : ''}STIJLVOORBEELDEN (eerder verzonden door fues@, neem alleen deze TOON/STIJL over, niet de inhoud):
${voorbeelden || '(geen voorbeelden beschikbaar — gebruik een nette, zakelijke maar vriendelijke toon)'}

${input.context ? `CONTEXT (uit HubSpot/RDW):\n${input.context}\n` : ''}
INKOMENDE MAIL om te beantwoorden:
Van: ${input.afzenderNaam ?? ''} <${input.afzenderEmail ?? ''}>
Categorie: ${input.categorie ?? 'onbekend'}
Onderwerp: ${input.onderwerp ?? '(geen)'}

${input.body.slice(0, 4000)}

Schrijf nu het concept-antwoord.`;

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}
