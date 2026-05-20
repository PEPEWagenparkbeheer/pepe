import type { TenderInput } from '@/lib/types/tender';

const SYSTEM_PROMPT = `Je extraheert lease-aanvraag informatie uit (doorgestuurde) e-mails voor autohandelaar PEPE Wagenparkbeheer.

Retourneer ALLEEN geldige JSON met deze velden:
- naam: volledige naam van de berijder/aanvrager (NIET van PEPE of een collega)
- email: e-mailadres van de aanvrager of null
- merk: automerk (bijv. "Skoda", "Volkswagen")
- model: model (bijv. "Fabia 1.0 TSI DSG-7")
- uitvoering: specifieke uitvoering/trim als genoemd (bijv. "Style", "Business") of null
- kleur: kleur incl. uitvoering (bijv. "Candy White signaal unilak") of null
- bekleding: bekledings-type als genoemd of null
- looptijd: aantal maanden (integer, bijv. 48)
- km_jaar: kilometers per jaar (integer, bijv. 30000)
- brandstof: "Benzine" | "Diesel" | "Elektrisch" | "Hybride" | "Plug-in hybride" | null
- co2: CO2 g/km (integer) of null
- bijtelling: bijtelling-percentage of null
- opties: array van { naam: string, type: "optie"|"accessoire"|"pakket"|null, prijs: number|null }
- prijzen_incl_btw: boolean of null — true als de mail expliciet zegt dat prijzen INCL btw zijn (bijv. "incl. BTW", "inclusief BTW"), false als EXCL btw (bijv. "ex btw", "excl. BTW", "+ 21% BTW", "netto prijzen"), null als niet duidelijk
- leasenorm: object met { categorie, winterbanden ("all_season"|"winter_zomer"|"zomer"|null), vervangend_vervoer ("24u"|"direct"|"geen"|null), eigen_risico ("laag"|"middel"|"hoog"|null), brandstofvoorschot (boolean|null) }

Regels:
- Filter signatures, forwarding-headers en disclaimers uit
- Opties: pak ALLE genoemde opties/accessoires/pakketten, ook als ze opgesomd staan zonder prijs
- BELANGRIJK voor optie-prijzen: prijs als puur getal (NUMBER, geen string), zonder valutateken/komma/punt-scheiding. Voorbeelden:
  * "€ 525,-" → 525
  * "€ 1.250,00" → 1250
  * "€ 1.250,50" → 1250.50
  * "525 euro" → 525
  * "EUR 1.250" → 1250
  * Geen prijs genoemd → null
  Decimalen: gebruik punt (.) NIET komma. Honderdtallen-scheiding altijd weglaten.
- Prijzen kunnen in tabellen, bullet-points of inline tussen haakjes staan (bijv. "Sunset glas (€ 525,-)").
  Pak per optie de bijbehorende prijs, niet algemene prijzen van de auto/totalen.
- Als een veld niet duidelijk staat: gebruik null
- Bij geen lease-aanvraag (factuur/spam/iets anders): { "geen_aanvraag": true }`;

export interface ParseResult {
  parsed?: TenderInput;
  geen_aanvraag?: boolean;
  error?: string;
}

export async function parseLeaseAanvraagMail(emailText: string): Promise<ParseResult> {
  if (!process.env.GROQ_API_KEY) {
    return { error: 'GROQ_API_KEY ontbreekt' };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: emailText },
        ],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('groq parse fout:', res.status, err);
      return { error: 'Groq HTTP ' + res.status };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { error: 'Geen Groq output' };

    const raw = JSON.parse(text) as Partial<TenderInput> & { geen_aanvraag?: boolean };
    if (raw.geen_aanvraag) return { geen_aanvraag: true };

    const parsed: TenderInput = {
      naam: raw.naam ?? '',
      email: raw.email ?? undefined,
      merk: raw.merk ?? '',
      model: raw.model ?? '',
      uitvoering: raw.uitvoering ?? undefined,
      kleur: raw.kleur ?? undefined,
      bekleding: raw.bekleding ?? undefined,
      looptijd: raw.looptijd ?? 48,
      km_jaar: raw.km_jaar ?? 30000,
      brandstof: raw.brandstof ?? undefined,
      co2: raw.co2 ?? undefined,
      bijtelling: raw.bijtelling ?? undefined,
      opties: Array.isArray(raw.opties) ? raw.opties : [],
      prijzen_incl_btw: typeof raw.prijzen_incl_btw === 'boolean' ? raw.prijzen_incl_btw : undefined,
      leasenorm: raw.leasenorm ?? {},
    };

    return { parsed };
  } catch (e) {
    console.error('groq parse exception:', e);
    return { error: 'Parse exception: ' + (e as Error).message };
  }
}
