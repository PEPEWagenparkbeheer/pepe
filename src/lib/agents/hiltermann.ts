import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Hiltermann agent — Stagehand v3 flow.
 *
 * Werkende stappen (bevestigd via debug-screenshots):
 * 1. goto(url) → login-pagina
 * 2. login (user + pass + submit)
 * 3. "Kies een verkoper" → Ga verder
 * 4. Configurator → klik merk-tegel
 * 5. Modellen-grid → klik model-tegel
 * 6. Types-tabel → klik prijs-knop in de juiste uitvoering rij
 * 7. Calculation-pagina → basisprijs zichtbaar
 *
 * TODO (volgende iteratie):
 * - Looptijd/km aanpassen via "Meer/Minder cyclen" buttons
 * - Opties-categorieën uitklappen + aanvinken (Lakken, Velgen, etc.)
 * - Leasenorm-velden (zitten op aparte stap, nog te ontdekken)
 */
export async function runHiltermann(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
      error_message: 'BROWSERBASE_API_KEY of BROWSERBASE_PROJECT_ID ontbreekt',
      duration_ms: Date.now() - start,
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
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

    // 1. Open inlog-pagina
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // 2. Inloggen
    await stagehand.act(`Vul het gebruikersnaam-veld in met: ${credentials.user}`);
    await stagehand.act(`Vul het wachtwoord-veld in met: ${credentials.pass}`);
    await stagehand.act('Klik op de inlog-knop');
    await page.waitForLoadState('networkidle', 10000).catch(() => {});

    // 3. "Kies een verkoper" — default doorgaan
    await stagehand.act('Klik op de knop "Ga verder"');
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // 4. Configurator: klik op merk-tegel in merken-grid
    await stagehand.act(`Klik op de merk-tegel (afbeelding/logo) van ${tender.merk} in de merkenlijst`);
    await page.waitForLoadState('networkidle', 6000).catch(() => {});

    // 5. Modellen-grid: klik op model-tegel
    await stagehand.act(`Klik op de model-tegel (afbeelding) van ${tender.model} in de modellenlijst`);
    await page.waitForLoadState('networkidle', 6000).catch(() => {});

    // 6. Types-tabel: klik op prijs-knop in de juiste uitvoering rij
    // De aanvraag heeft 'model' als bv. 'Fabia 1.0 TSI DSG-7'. Op de pagina staan
    // uitvoeringen met motor (kW), transmissie (dsg-7 aut), etc.
    // Laat Claude de juiste rij matchen.
    const uitvoeringHint = [tender.model, tender.uitvoering, tender.brandstof]
      .filter(Boolean).join(' ');
    await stagehand.act(
      `Op deze pagina staan meerdere uitvoeringen in een tabel. Kies de rij die het beste matched met: "${uitvoeringHint}". ` +
      `Klik op de prijs-knop (donker rond, met €-bedrag) helemaal rechts in die rij.`,
    );
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // 7. We staan nu op de calculation-pagina met basisprijs zichtbaar.
    // Lees de maandelijkse leaseprijs uit.
    const extracted = await stagehand.extract(
      'Haal de maandelijkse leaseprijs op zoals getoond bij "Full operational lease". Dit is het grote €-bedrag per maand, niet de fiscale waarde of catalogusprijs.',
      z.object({
        maandprijs: z.number().describe('Bedrag per maand in euro (alleen het getal, geen €-teken)'),
      }),
    );

    return {
      portaal: 'hiltermann',
      status: 'completed',
      maandprijs: extracted.maandprijs,
      raw: { extracted: extracted as Record<string, unknown> },
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
