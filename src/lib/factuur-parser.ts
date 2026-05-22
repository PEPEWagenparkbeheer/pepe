// Extraheert factuur-velden uit ruwe PDF-tekst via Groq.
// Server-only. Werkt zonder voorbeeld-PDF op het juiste pakket; bij
// nieuwe layouts hoeft alleen de prompt te worden bijgesteld.

export interface FactuurExtract {
  factuurnummer?: string | null;
  factuurdatum?: string | null;        // ISO yyyy-mm-dd
  kenteken?: string | null;
  bedrijfsnaam?: string | null;
  kvk?: string | null;
  berijder_naam?: string | null;
  berijder_email?: string | null;
  bedrag_excl_btw?: number | null;
  bedrag_incl_btw?: number | null;
  is_auto_factuur?: boolean;           // model-inschatting of dit over een auto gaat
}

const SYSTEM_PROMPT = `Je extraheert factuurgegevens uit (Nederlandse) verkoopfactuur-PDF tekst voor autohandelaar PEPE Wagenparkbeheer.

Retourneer ALLEEN geldige JSON met deze velden (null als niet duidelijk):
- factuurnummer: het factuurnummer (string)
- factuurdatum: factuurdatum in ISO-formaat "yyyy-mm-dd"
- kenteken: Nederlands kenteken zoals "AB-123-C" of "12-AB-34" — geef terug zonder streepjes en in HOOFDLETTERS (bijv. "AB123C")
- bedrijfsnaam: naam van de klant (het bedrijf dat de factuur ontvangt, NIET PEPE zelf)
- kvk: KvK-nummer van de klant als genoemd (string van 8 cijfers)
- berijder_naam: persoonsnaam van de berijder/contactpersoon als genoemd (NIET PEPE-medewerker)
- berijder_email: e-mail van de berijder/klant als genoemd
- bedrag_excl_btw: totaalbedrag excl. BTW als number (puur getal, geen valutateken, punt voor decimalen)
- bedrag_incl_btw: totaalbedrag incl. BTW als number
- is_auto_factuur: true als de factuur duidelijk over een auto/voertuig gaat (kenteken aanwezig, autoverkoop, lease, onderhoud, etc), anders false

Belangrijk:
- PEPE zelf is de verzender, niet de klant. Negeer alle PEPE-gegevens (naam, KvK, adres, IBAN).
- Bedragen: "€ 1.250,00" → 1250.00. Honderdtallen-scheiding altijd weglaten, komma vervangen door punt.
- Bij onduidelijkheid: null. NIET raden.`;

export async function parseFactuurTekst(tekst: string): Promise<FactuurExtract | null> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY ontbreekt — sla factuur op zonder extract');
    return null;
  }

  // Limiteer input zodat Groq context-window niet wordt overschreden.
  // Een factuur is doorgaans <8k chars; we kappen op 20k voor zekerheid.
  const input = tekst.slice(0, 20_000);

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
          { role: 'user', content: input },
        ],
        temperature: 0,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.error('factuur-parser groq fout:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const obj = JSON.parse(raw) as FactuurExtract;

    return {
      factuurnummer: obj.factuurnummer ?? null,
      factuurdatum: normaliseerDatum(obj.factuurdatum),
      kenteken: obj.kenteken ? obj.kenteken.replace(/[-\s]/g, '').toUpperCase() : null,
      bedrijfsnaam: obj.bedrijfsnaam ?? null,
      kvk: obj.kvk ?? null,
      berijder_naam: obj.berijder_naam ?? null,
      berijder_email: obj.berijder_email ?? null,
      bedrag_excl_btw: typeof obj.bedrag_excl_btw === 'number' ? obj.bedrag_excl_btw : null,
      bedrag_incl_btw: typeof obj.bedrag_incl_btw === 'number' ? obj.bedrag_incl_btw : null,
      is_auto_factuur: obj.is_auto_factuur ?? false,
    };
  } catch (e) {
    console.error('factuur-parser exception:', e);
    return null;
  }
}

// Accepteer "2026-05-22", "22-05-2026", "22/05/2026", "22-5-26" → ISO.
function normaliseerDatum(d?: string | null): string | null {
  if (!d) return null;
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 70 ? '19' : '20') + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}
