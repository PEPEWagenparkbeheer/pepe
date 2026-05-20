import { NextRequest, NextResponse } from 'next/server';
import type { TenderInput } from '@/lib/types/tender';

export const runtime = 'nodejs';

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

interface GroqExtract extends Partial<TenderInput> {
  geen_aanvraag?: boolean;
}

async function groqExtract(emailText: string): Promise<GroqExtract | null> {
  if (!process.env.GROQ_API_KEY) return null;
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
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return text ? (JSON.parse(text) as GroqExtract) : null;
  } catch (e) {
    console.error('groq parse exception:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const emailText: string = body.email ?? '';

  if (!emailText || emailText.length < 10) {
    return NextResponse.json({ error: 'email-veld ontbreekt of te kort' }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY ontbreekt op de server' }, { status: 500 });
  }

  const parsed = await groqExtract(emailText);

  if (!parsed) {
    return NextResponse.json({ error: 'Groq parse mislukt' }, { status: 502 });
  }

  if (parsed.geen_aanvraag) {
    return NextResponse.json({ geen_aanvraag: true });
  }

  // Defaults voor optionele velden zodat de UI niet crasht
  const result: TenderInput = {
    naam: parsed.naam ?? '',
    email: parsed.email ?? undefined,
    merk: parsed.merk ?? '',
    model: parsed.model ?? '',
    uitvoering: parsed.uitvoering ?? undefined,
    kleur: parsed.kleur ?? undefined,
    bekleding: parsed.bekleding ?? undefined,
    looptijd: parsed.looptijd ?? 48,
    km_jaar: parsed.km_jaar ?? 30000,
    brandstof: parsed.brandstof ?? undefined,
    co2: parsed.co2 ?? undefined,
    bijtelling: parsed.bijtelling ?? undefined,
    opties: Array.isArray(parsed.opties) ? parsed.opties : [],
    leasenorm: parsed.leasenorm ?? {},
  };

  return NextResponse.json({ parsed: result });
}
