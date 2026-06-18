import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { extractJson } from '@/lib/llm/extractJson';

const MERKEN = [
  'Alfa Romeo', 'Audi', 'BMW', 'Bentley', 'BYD', 'Citroën', 'Cupra', 'Dacia', 'DS', 'Ferrari',
  'Fiat', 'Ford', 'Genesis', 'Honda', 'Hyundai', 'Ineos', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini',
  'Land Rover', 'Leapmotor', 'Lexus', 'Lucid', 'Maserati', 'Mazda', 'Mercedes-Benz', 'MG', 'Mini',
  'Mitsubishi', 'Nio', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Polestar', 'Porsche', 'Renault',
  'Rivian', 'Seat', 'Skoda', 'Smart', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'XPeng', 'Zeekr',
];

const KLEUREN = ['Zwart', 'Wit', 'Grijs', 'Zilver', 'Antraciet', 'Blauw', 'Rood', 'Groen', 'Bruin/Beige'];
const BRANDSTOF = ['benzine', 'diesel', 'hybride', 'phev', 'elektrisch'];
const OPTIES_SLEUTELS = ['pano', 'trekhaak', 'acc', 'carplay', 'leder', 'camera', 'automaat', 'hud', 'luchtvering'];
const OPTIES_LABELS: Record<string, string> = {
  pano: 'panoramadak',
  trekhaak: 'trekhaak',
  acc: 'acc cruise control',
  carplay: 'carplay android auto',
  leder: 'leder bekleding',
  camera: 'achteruitrijcamera',
  automaat: 'automaat transmissie',
  hud: 'head-up display hud',
  luchtvering: 'luchtvering',
};

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const tekst = body?.tekst;
    if (!tekst?.trim()) return NextResponse.json({ error: 'Geen tekst' }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY niet ingesteld' }, { status: 500 });

    const client = new Groq({ apiKey });

    const prompt = `Je bent een assistent voor een autohandelaar. Analyseer dit WhatsApp bericht van een klant en extraheer de zoekopdracht.

BERICHT:
${tekst}

Extraheer de volgende velden. Antwoord ALLEEN met geldige JSON, geen extra tekst.

Velden:
- klant: naam van de klant (string, of "" als onbekend)
- merk: automerk, kies uit: ${MERKEN.join(', ')} (string, of "" als niet gevonden)
- model: model naam zonder merk (string, of "")
- km: max kilometerstand als getal-string bijv "130000" of bereik "50000-130000" (string, of "")
- jaar: bouwjaar of bereik bijv "2020" of "2019-2022" (string, of "")
- budget: budget als getal-string zonder € bijv "25000" of bereik "20000-25000" (string, of "")
- btw: "BTW" als klant BTW-auto wil, "Marge" als marginauto, "" als niet vermeld
- kleuren: array van gewenste kleuren, kies alleen uit: ${KLEUREN.join(', ')} (array, of [])
- brandstof: array van brandstoftypes, kies alleen uit: ${BRANDSTOF.join(', ')} (array, of [])
- opties: object met true/false voor deze opties (alleen true als duidelijk gewenst):
  ${OPTIES_SLEUTELS.map((k) => `"${k}" (${OPTIES_LABELS[k]})`).join(', ')}
- details: vrije tekst met extra wensen, uitvoeringseisen, bijzonderheden (string, of "")

Voorbeeld output:
{"klant":"Burhan","merk":"Volkswagen","model":"Sharan of Tiguan","km":"130000","jaar":"","budget":"20000-25000","btw":"","kleuren":["Zwart","Antraciet"],"brandstof":["benzine"],"opties":{"automaat":true},"details":"Luxe uitvoering, geen R line"}`;

    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'AI gaf geen geldig antwoord' }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    console.error('[whatsapp-parse]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
