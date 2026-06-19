// src/lib/leads/concept.ts
// Genereert een concept-antwoord op een lead (geïnteresseerde koper) in de PEPE
// tone-of-voice, in de taal van de klant, met inruil-detectie. Server-only.
// Draait op Claude Opus 4.8 — de voorgestelde mails moeten taaltechnisch top zijn.
//
// Voorraad/beschikbaarheid is nog NIET gekoppeld (Mobilox volgt): het concept claimt
// daarom niet hard dat de auto beschikbaar is, maar zegt dat we het even checken.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY ontbreekt in omgevingsvariabelen');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export interface LeadConceptInput {
  klant_naam: string;
  auto: string;
  prijs?: string | null;
  advertentie_url?: string | null;
  bericht?: string | null;
  bron?: string | null;
  /** Staat de auto nog in onze voorraad? true = bevestigen, anders niet claimen. */
  beschikbaar?: boolean | null;
  /** Door medewerkers vastgelegde leerpunten uit eerdere leadconcepten. */
  feedbackLessen?: string;
  /** Door RDW gevalideerd voertuig dat de klant wil inruilen. */
  inruilVoertuig?: { kenteken: string; merk: string; model: string } | null;
}

export interface LeadConcept {
  /** Antwoordtekst (aanhef t/m laatste inhoudelijke zin; ZONDER groet/handtekening). */
  body: string;
  /** True als het concept een inruil-/fotoverzoek bevat → waardebepaling-PDF meesturen. */
  inruil: boolean;
}

const SYSTEM_PROMPT = `Je schrijft namens PEPE Wagenparkbeheer een kort, persoonlijk concept-antwoord op een lead: een geïnteresseerde koper die reageert op een auto die wij te koop aanbieden.

TAAL: Antwoord in dezelfde taal als het bericht van de klant (Nederlands → Nederlands, Engels → Engels, Duits → Duits, enzovoort). Match ook de aanspreekvorm informeel.

TOON: Informeel (je/jij of het informele equivalent in de taal), kort, vriendelijk en concreet. Geen verkooppraat.

STRUCTUUR:
- Aanhef met de voornaam van de klant: "Beste [voornaam]," (of passend in de taal). Gebruik alleen de voornaam; als er geen echte naam is, laat de naam weg.
- Bedank en verwijs naar de auto: bijv. "Dank voor je aanvraag." / "Dank voor je reactie op de [auto] die wij te koop aanbieden." / "Dank voor je bericht."
- BESCHIKBAARHEID: volg de VOORRAAD-aanwijzing onderaan het bericht. Staat de auto in voorraad → bevestig kort dat hij nog beschikbaar is, bijv. "De [auto] is nog beschikbaar." Is de voorraad onbekend/niet gevonden → claim NIETS over beschikbaarheid, maar zeg dat je het even checkt, bijv. "Ik check even of de [auto] nog beschikbaar is en kom zo snel mogelijk bij je terug." (vertaal naar de taal van de klant).
- INRUIL: als de klant een inruil/inkoop noemt, óf een eigen (huidige) auto die ingeruild kan worden: bevestig dat inruil mogelijk is en vraag om foto's voor een waardebepaling — verwijs naar het document in de bijlage ("In de bijlage tref je een document waarop staat welke foto's wij precies nodig hebben"). Stel daarbij twee vragen: of de in te ruilen auto privé of zakelijk is (marge of btw), en wanneer de laatste onderhoudsbeurt is geweest. Sluit af met: "Zodra wij de foto's hebben gaan we voor je aan de slag." (vertaald).
- Bij GEEN inruil: een passende korte afsluiting, geen fotoverzoek.
- Als RDW-INRUILVOERTUIG is meegegeven, benoem dan ALTIJD merk én model bij het kenteken; noem nooit alleen kenteken en kilometerstand.

BELANGRIJK: voeg GEEN groet-ondertekening of handtekening toe (dus géén "Met vriendelijke groet" of contactgegevens) — die wordt automatisch toegevoegd. Eindig na de laatste inhoudelijke zin.

Retourneer UITSLUITEND geldige JSON, geen markdown:
{"body":"<de antwoordtekst, gebruik \\n voor regelafbrekingen>","inruil":true|false}
inruil = true als je het inruil-/fotoverzoek hebt opgenomen, anders false.`;

export async function genereerLeadConcept(input: LeadConceptInput): Promise<LeadConcept> {
  const voorraadLijn =
    input.beschikbaar === true
      ? 'VOORRAAD: De auto staat nog in onze voorraad — bevestig dat hij nog beschikbaar is.'
      : 'VOORRAAD: Onbekend / niet in de voorraad gevonden — bevestig de beschikbaarheid NIET; zeg dat je het even checkt.';

  const user = [
    input.feedbackLessen
      ? `MEDEWERKERSFEEDBACK (pas deze leerpunten toe; de vaste regels en feitelijke leadgegevens gaan voor bij strijdigheid):\n${input.feedbackLessen}`
      : '',
    `Naam klant: ${input.klant_naam || '(onbekend)'}`,
    `Auto (ons aanbod): ${input.auto}${input.prijs ? ` — ${input.prijs}` : ''}`,
    input.bron ? `Bron: ${input.bron}` : '',
    input.inruilVoertuig
      ? `RDW-INRUILVOERTUIG (geverifieerd): ${input.inruilVoertuig.merk} ${input.inruilVoertuig.model}, kenteken ${input.inruilVoertuig.kenteken}. Benoem merk en model expliciet in je reactie.`
      : '',
    `Bericht van de klant:`,
    (input.bericht || '(geen los bericht; alleen interesse in bovenstaande auto)').slice(0, 4000),
    '',
    voorraadLijn,
  ]
    .filter(Boolean)
    .join('\n');

  const client = getClient();
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  });

  const raw =
    completion.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<LeadConcept>;
    return {
      body: typeof parsed.body === 'string' ? parsed.body : '',
      inruil: parsed.inruil === true,
    };
  } catch {
    // Val terug op het eerste JSON-object in de tekst.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const p = JSON.parse(m[0]) as Partial<LeadConcept>;
        return { body: typeof p.body === 'string' ? p.body : '', inruil: p.inruil === true };
      } catch {
        /* val door */
      }
    }
    // Laatste redmiddel: ruwe tekst als body.
    return { body: cleaned, inruil: /inruil|inbijlage|bijlage/i.test(cleaned) };
  }
}
