// src/lib/brein/concept.ts
// Genereert een concept-antwoord op een inkomende berijdersmail.
// Tone-of-voice: live meegegeven verzonden mails als stijlvoorbeeld (niet opgeslagen).
// Server-only — gebruik uitsluitend in API routes of server actions.
//
// Draait op Claude (Anthropic) voor de beste Nederlandse toon.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

export interface ConceptInput {
  onderwerp: string | null;
  afzenderNaam: string | null;
  afzenderEmail: string | null;
  categorie: string | null;
  body: string; // platte tekst van de inkomende mail
  /** Mailbox waarvoor het concept gegenereerd wordt — bepaalt persona en systeem-prompt. */
  mailbox?: string;
  /** Recente verzonden mails als stijlvoorbeeld (subject + preview). */
  stijlvoorbeelden: { subject: string; bodyPreview: string }[];
  /** Optionele extra context (HubSpot/RDW), vrije tekst. */
  context?: string;
  /** PEPE-procedures/beslislogica die het antwoord inhoudelijk sturen. */
  procedures?: string;
  /** Door medewerkers vastgelegde leerpunten uit eerdere concepten. */
  feedbackLessen?: string;
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

const WAGENPARKBEHEER_PROMPT = `Je bent de wagenparkbeheerder van PEPE Wagenparkbeheer en beantwoordt e-mails van berijders namens de mailbox fues@pepewagenparkbeheer.nl.

Je schrijft een CONCEPT-antwoord dat een medewerker daarna nakijkt en eventueel aanpast voordat het verstuurd wordt. Regels:
- VOLG ALTIJD de meegegeven PEPE-PROCEDURES. Die bepalen WAT je inhoudelijk antwoordt. Past de situatie bij een procedure, geef dan exact die actie — verzin NOOIT een eigen procedure of oplossing. (Voorbeeld: bij een geblokkeerde tankpas door 3x verkeerde pincode is het juiste antwoord 24 uur wachten tot automatische deblokkering — NIET een nieuwe pas bestellen.)
- Schrijf in het Nederlands.
- Gebruik ALLE gegevens uit de CONTEXT direct in je antwoord (leasemaatschappij, kenteken, merk, APK-datum, woonplaats, fiscale waarde, zoeklinks). Stel zo min mogelijk wedervragen en vraag NOOIT naar informatie die al in de context staat. Kun je iets aanleveren (zoeklink, datum), zet het er meteen in.
- Neem de schrijfstijl, toon en aanhef over van de meegestuurde voorbeelden van eerder verzonden mails.
- Wees concreet en behulpzaam; verzin GEEN feiten, bedragen, data of toezeggingen die niet uit de mail of de context blijken.
- Als informatie ontbreekt om volledig te antwoorden, geef dan een net antwoord en markeer ontbrekende stukken met [TUSSEN HAAKJES] zodat de medewerker het kan invullen.
- Geen disclaimers over dat je een AI bent. Schrijf alsof jij de wagenparkbeheerder bent.
- BELANGRIJK: sluit af met de groet-regel (bijv. "Met vriendelijke groet,") en STOP daarna. Schrijf GEEN naam, functietitel, telefoonnummer, adres of logo — de vaste officiële handtekening wordt automatisch toegevoegd bij het versturen.
- Geef ALLEEN de tekst van het concept-antwoord terug (aanhef t/m de groet-regel), geen uitleg, geen onderwerp-regel.`;

const LEADS_PROMPT = `Je bent een wagenparkbeheer-adviseur bij PEPE Wagenparkbeheer en beantwoordt vragen van potentiële klanten die interesse tonen in wagenparkbeheer.

Regels:
- Reageer commercieel en behulpzaam: maak het aantrekkelijk om met PEPE samen te werken.
- Beantwoord de concrete vraag van de lead direct, kort en duidelijk.
- Stel een vrijblijvend adviesgesprek voor als de lead voldoende informatie heeft gegeven.
- Schrijf in het Nederlands, professioneel en warm van toon.
- Geen disclaimers over dat je een AI bent. Schrijf als adviseur.
- Verzin GEEN concrete tarieven of toezeggingen — markeer die met [TUSSEN HAAKJES].
- BELANGRIJK: sluit af met de groet-regel (bijv. "Met vriendelijke groet,") en STOP daarna. Schrijf GEEN naam, functietitel of contactgegevens — de handtekening wordt automatisch toegevoegd.
- Geef ALLEEN de tekst van het concept-antwoord terug (aanhef t/m de groet-regel), geen uitleg, geen onderwerp-regel.`;

function getSystemPrompt(mailbox: string): string {
  return mailbox.startsWith('info@') ? LEADS_PROMPT : WAGENPARKBEHEER_PROMPT;
}

/** Genereert een concept-antwoord. Geeft platte tekst terug. */
export async function genereerConcept(input: ConceptInput): Promise<string> {
  const voorbeelden = input.stijlvoorbeelden
    .slice(0, 8)
    .map((v, i) => `Voorbeeld ${i + 1} — onderwerp: ${v.subject}\n${v.bodyPreview}`)
    .join('\n\n---\n\n');

  const userContent = `${input.procedures ? `PEPE-PROCEDURES (volg deze EXACT voor de inhoud van je antwoord):\n${input.procedures}\n\n` : ''}${input.feedbackLessen ? `MEDEWERKERSFEEDBACK (pas deze leerpunten toe; procedures en feitelijke context gaan altijd voor bij strijdigheid):\n${input.feedbackLessen}\n\n` : ''}STIJLVOORBEELDEN (eerder verzonden door fues@, neem alleen deze TOON/STIJL over, niet de inhoud):
${voorbeelden || '(geen voorbeelden beschikbaar — gebruik een nette, zakelijke maar vriendelijke toon)'}

${input.context ? `CONTEXT (uit HubSpot/RDW):\n${input.context}\n` : ''}
INKOMENDE MAIL om te beantwoorden:
Van: ${input.afzenderNaam ?? ''} <${input.afzenderEmail ?? ''}>
Categorie: ${input.categorie ?? 'onbekend'}
Onderwerp: ${input.onderwerp ?? '(geen)'}

${input.body.slice(0, 4000)}

Schrijf nu het concept-antwoord.`;

  const client = getClient();
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: getSystemPrompt(input.mailbox ?? 'fues@pepewagenparkbeheer.nl'),
    messages: [{ role: 'user', content: userContent }],
  });

  return (
    completion.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? ''
  );
}
