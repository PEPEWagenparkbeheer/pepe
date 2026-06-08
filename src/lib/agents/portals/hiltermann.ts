import type { TenderInput } from '@/lib/types/tender';
import type { AgentContext, AgentResult } from '../types';
import { runAutonomousAgent, type PortalConfig } from '../autonomous';
import { pageText } from '../stagehand-factory';

/** PEPE-standaard provisie voor Hiltermann (default in portaal is €1000). */
const PROVISIE_HILTERMANN = 2000;

/** Leest "Full operational lease €xxx" uit de zijbalk als DOM-fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readFolPrice(page: any): Promise<number | null> {
  try {
    const text = await pageText(page);
    const m = text.match(/Full operational lease[\s\S]{0,200}€\s*([\d.,]+)/i);
    if (!m) return null;
    const cijfers = m[1].replace(/\./g, '').split(',')[0];
    const n = parseInt(cijfers, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function buildMission(tender: TenderInput): string {
  const inclBtw = tender.prijzen_incl_btw === false ? 'excl. btw' : 'incl. btw';
  const optieRegels = tender.opties
    .map((o) => `   - ${o.naam}${o.prijs != null ? ` (ongeveer €${o.prijs} ${inclBtw})` : ''}`)
    .join('\n');

  const winterbandenUit = tender.leasenorm.winterbanden === 'all_season';
  const vervangendVervoerUit = tender.leasenorm.vervangend_vervoer === 'geen';

  return `Je bent ingelogd in het Hiltermann lease-portaal (een single-page applicatie).
Voer een complete operational-lease calculatie uit voor onderstaande auto en lees aan het eind de maandprijs af.

AUTO:
- Merk: ${tender.merk}
- Model: ${tender.model}
- Uitvoering: ${tender.uitvoering ?? '(beste match kiezen)'}
- Brandstof: ${tender.brandstof ?? 'onbekend'}

VOLG DEZE STAPPEN IN VOLGORDE:

1. VERKOPER: Als er een scherm "Kies een verkoper" verschijnt, klik op de knop "Ga verder".

2. MERK: De pagina toont eerst kort "Ophalen merken.." — WACHT tot de merk-tegels daadwerkelijk zichtbaar zijn. Klik dan op de afbeelding-tegel van merk "${tender.merk}".

3. MODEL: Opnieuw kan er "Ophalen modellen.." staan — wacht tot de modellen geladen zijn. Klik op de tegel van model "${tender.model}".

4. UITVOERING: Er verschijnt een tabel met uitvoeringen. Kies de rij die het BEST matcht met "${[tender.uitvoering, tender.brandstof].filter(Boolean).join(' ')}". Klik op de ronde prijs-knop helemaal rechts in die rij (donker, met een €-bedrag erop) om de calculatie te openen. Je weet dat je goed zit als je tekst als "Full operational lease" en "Fiscale waarde" ziet.

5. OPTIES: Klap alle optie-categorieën uit (klik op de + naast titels als Optiepakketten, Lakken, Bekleding, Velgen/Banden, Interieur, Exterieur, Overige accessoires, Overige opties). Vink vervolgens per onderstaande optie het bijbehorende rondje/bolletje aan. Gebruik de prijs-hint om de juiste te kiezen:
${optieRegels || '   (geen losse opties)'}
   Staat een optie NIET in de uitklaplijsten? Voeg hem dan toe via het formulier "Eigen opties toevoegen" onderaan: vul Beschrijving + Prijs ${inclBtw} in en klik "Toevoegen". Sla een optie over die je echt niet kunt plaatsen en noem hem in je toelichting.

6. PRIJSINSTELLINGEN: Klik linksboven op "Prijsinstellingen" (tandwiel-icoon). Zet:
   - Looptijd op ${tender.looptijd} maanden
   - Kilometrage per jaar op ${tender.km_jaar}${
     winterbandenUit ? '\n   - Zet de checkbox "Winterbanden" UIT (klant rijdt all-season)' : ''
   }${vervangendVervoerUit ? '\n   - Zet de checkbox "Vervangend vervoer" UIT' : ''}

7. PROVISIE: Ga binnen die modal naar het tabblad "Overige instellingen". Maak via het oog-icoon naast "Provisie" het bedrag-veld zichtbaar, wis het en zet het op ${PROVISIE_HILTERMANN} euro.

8. HERCALCULEREN: Klik op de zwarte knop "Hercalculeren" rechtsonder en wacht tot de prijs is bijgewerkt. Sluit daarna de modal (X) als die nog open is.

9. PRIJS AFLEZEN: Lees in de linker zijbalk het grote maandbedrag onder "Full operational lease" af. Dit is de maandprijs die je teruggeeft — NIET de fiscale waarde, cataloguswaarde of een tarief per kilometer.

Belangrijk: deze SPA verandert de URL niet altijd; oriënteer je op de zichtbare tekst. Neem de tijd om laad-indicatoren ("Ophalen..", spinners) af te wachten voordat je verder klikt.`;
}

export const hiltermannConfig: PortalConfig = {
  portaal: 'hiltermann',
  login: {
    fields: [
      { selector: 'input[placeholder="Gebruikersnaam"]', valueFrom: 'user' },
      { selector: 'input[placeholder="Wachtwoord"]', valueFrom: 'pass' },
    ],
    submitInstruction: 'Klik op de "Inloggen" knop',
    ready: ['Kies een verkoper', 'Welkom'],
  },
  buildMission,
  readPriceFromDom: readFolPrice,
};

/** Autonome Hiltermann-agent — drop-in vervanger voor de oude runHiltermann. */
export function runHiltermannAuto(ctx: AgentContext): Promise<AgentResult> {
  return runAutonomousAgent(ctx, hiltermannConfig);
}
