import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Hiltermann agent — complete configuratie-flow.
 *
 * Stappen (uit de live walkthrough):
 *  1. goto + login
 *  2. Verkoper bevestigen ("Ga verder")
 *  3. Merk → Model → Uitvoering (klik prijs-knop in tabel-rij)
 *  4. Calculation-pagina met opties-categorieën:
 *     - Klik + naast elke categorie om uit te klappen
 *     - Vink het rondje aan bij elke matchende optie
 *     - Voor opties die NIET in een categorie zitten: 'Eigen opties toevoegen'
 *       (onderaan) met Code/Prijs incl btw/Beschrijving
 *  5. Open 'Prijsinstellingen' (linksboven):
 *     - Algemeen-tab: looptijd + km/jaar dropdowns
 *     - Toggle Verzekering / Vervangend vervoer / Winterbanden (op basis norm)
 *     - Overige instellingen-tab: provisie aanpassen (Hiltermann = €2000)
 *  6. Klik 'Hercalculeren' (zwarte knop rechtsonder)
 *  7. Lees nieuwe maandprijs van Full Operational Lease
 */

// Hiltermann-specifieke config
const PROVISIE_HILTERMANN = 2000;

const CATEGORIEEN = [
  'Optiepakketten',
  'Lakken',
  'Bekleding',
  'Velgen/Banden',
  'Interieur',
  'Exterieur',
  'Overige accessoires',
  'Overige opties',
];

export async function runHiltermann(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    return {
      portaal: 'hiltermann', status: 'failed',
      error_message: 'BROWSERBASE_API_KEY of BROWSERBASE_PROJECT_ID ontbreekt',
      duration_ms: Date.now() - start,
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      portaal: 'hiltermann', status: 'failed',
      error_message: 'ANTHROPIC_API_KEY ontbreekt',
      duration_ms: Date.now() - start,
    };
  }

  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    verbose: 1,
  });

  try {
    await stagehand.init();
    const page = await stagehand.context.newPage();

    // ── 1. Login ──
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', 8000).catch(() => {});
    await stagehand.act(`Vul het gebruikersnaam-veld in met: ${credentials.user}`);
    await stagehand.act(`Vul het wachtwoord-veld in met: ${credentials.pass}`);
    await stagehand.act('Klik op de inlog-knop');
    await page.waitForLoadState('networkidle', 10000).catch(() => {});

    // ── 2. Verkoper bevestigen ──
    await stagehand.act('Klik op de knop "Ga verder"');
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // ── 3. Auto selecteren ──
    await stagehand.act(`Klik op de merk-tegel van ${tender.merk}`);
    await page.waitForLoadState('networkidle', 6000).catch(() => {});

    await stagehand.act(`Klik op de model-tegel van ${tender.model}`);
    await page.waitForLoadState('networkidle', 6000).catch(() => {});

    // ── 4. Juiste uitvoering kiezen via prijs-knop in tabel ──
    const uitvoeringHint = [tender.model, tender.uitvoering, tender.brandstof].filter(Boolean).join(' ');
    await stagehand.act(
      `Op deze pagina staat een tabel met uitvoeringen. Kies de rij die het beste matched met: "${uitvoeringHint}". ` +
      `Klik op de prijs-knop (donker rond, met €-bedrag) helemaal rechts in die rij.`,
    );
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // ── 5. Opties-categorieën uitklappen ──
    for (const cat of CATEGORIEEN) {
      await stagehand.act(
        `Klik op het + icoon (uitklap-pijl) naast de categorie-titel "${cat}" om de opties uit te klappen. ` +
        `Als hij al open staat, sla deze stap over.`,
      ).catch(() => {});
    }

    // ── 6. Opties matchen + aanvinken (per tender-optie) ──
    // Eerst proberen via de categorieën (rondje aanvinken).
    // Lukt het niet, dan toevoegen als 'Eigen optie' onderaan.
    const ongevondenOpties: typeof tender.opties = [];
    for (const optie of tender.opties) {
      const prijsHint = optie.prijs
        ? ` (prijs ongeveer €${optie.prijs}${tender.prijzen_incl_btw === false ? ' ex btw' : ' incl btw'})`
        : '';
      try {
        await stagehand.act(
          `Vink in de uitgeklapte optie-categorieën het rondje/bolletje aan bij de optie die het beste matched met: "${optie.naam}"${prijsHint}. ` +
          `Als je hem niet kunt vinden, sla dan over (doe niets).`,
        );
      } catch {
        ongevondenOpties.push(optie);
      }
    }

    // ── 7. Niet-gevonden opties toevoegen via 'Eigen opties toevoegen' ──
    for (const optie of ongevondenOpties) {
      try {
        await stagehand.act(
          `Scroll naar het "Eigen opties toevoegen" formulier onderaan de pagina. ` +
          `Selecteer "Accessoire" in de dropdown. ` +
          `Vul de Beschrijving in: "${optie.naam}". ` +
          `Vul "Prijs incl. BTW" in met: ${optie.prijs ?? 0}. ` +
          `Klik op de knop "Toevoegen".`,
        );
        await page.waitForLoadState('networkidle', 3000).catch(() => {});
      } catch {
        // niet kritiek
      }
    }

    // ── 8. Prijsinstellingen modal openen ──
    await stagehand.act('Klik op de knop "Prijsinstellingen" (links bovenaan, met tandwiel-icoon)');
    await page.waitForLoadState('networkidle', 3000).catch(() => {});

    // Looptijd dropdown
    await stagehand.act(
      `In de modal "Prijsinstellingen" tab "Algemeen": open de "Looptijd" dropdown en selecteer ${tender.looptijd}`,
    );

    // Km/jaar dropdown
    await stagehand.act(
      `Open de "Kilometrage per jaar" dropdown en selecteer ${tender.km_jaar}`,
    );

    // ── Norm-instellingen: Diversen sectie ──
    // Verzekering staat default aan (verplicht volgens label). Vervangend vervoer + Winterbanden zijn toggleable.
    if (tender.leasenorm.vervangend_vervoer === 'geen') {
      await stagehand.act('Vink de checkbox "Vervangend vervoer" UIT in de Diversen sectie').catch(() => {});
    }
    if (tender.leasenorm.winterbanden === 'all_season') {
      // All season betekent géén aparte winterbanden nodig
      await stagehand.act('Vink de checkbox "Winterbanden" UIT in de Diversen sectie').catch(() => {});
    }

    // ── 9. Overige instellingen tab → provisie aanpassen ──
    await stagehand.act('Klik op het tabblad "Overige instellingen" bovenin de modal');
    await page.waitForLoadState('networkidle', 1500).catch(() => {});

    // Provisie is verborgen → klik op oog-icoon om zichtbaar te maken
    await stagehand.act('Klik op het oog-icoon naast het "Provisie" veld om het bedrag-veld zichtbaar te maken').catch(() => {});
    // Wijzig waarde
    await stagehand.act(
      `Wijzig het bedrag in het Provisie veld naar ${PROVISIE_HILTERMANN} ` +
      `(eerst de huidige waarde wissen, dan ${PROVISIE_HILTERMANN} typen)`,
    );

    // ── 10. Hercalculeren ──
    await stagehand.act('Klik op de zwarte "Hercalculeren" knop rechtsonder in de modal');
    await page.waitForLoadState('networkidle', 8000).catch(() => {});
    // Modal sluit automatisch (of: blijven we erin?)

    // ── 11. Lees nieuwe maandprijs ──
    const extracted = await stagehand.extract(
      'Haal de maandelijkse leaseprijs op zoals nu getoond bij "Full operational lease" (FOL tab). ' +
      'Dit is het grote €-bedrag dat na hercalculeren is bijgewerkt. Niet de fiscale waarde of catalogusprijs.',
      z.object({
        maandprijs: z.number().describe('Bedrag per maand in euro'),
      }),
    );

    return {
      portaal: 'hiltermann',
      status: 'completed',
      maandprijs: extracted.maandprijs,
      raw: {
        extracted: extracted as Record<string, unknown>,
        ongevonden_opties: ongevondenOpties.map((o) => o.naam),
        provisie_gebruikt: PROVISIE_HILTERMANN,
      },
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
      error_message: (e as Error).message,
      duration_ms: Date.now() - start,
    };
  } finally {
    await stagehand.close().catch(() => {});
  }
}
