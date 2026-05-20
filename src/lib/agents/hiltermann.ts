import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Hiltermann agent — template voor de andere 4 portalen.
 *
 * Belangrijk: in Stagehand v3 moet je echte navigatie via `page.goto()` doen,
 * niet via `stagehand.act("Open ...")`. Acts werken alleen op de huidige pagina.
 */
export async function runHiltermann(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
      error_message: 'BROWSERBASE_API_KEY of BROWSERBASE_PROJECT_ID ontbreekt in env',
      duration_ms: Date.now() - start,
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
      error_message: 'ANTHROPIC_API_KEY ontbreekt in env',
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

    // 1. Open de inlog-pagina via echte navigation
    const page = await stagehand.context.newPage();
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', 5000).catch(() => {});

    // 2. Inloggen
    await stagehand.act(`Vul het gebruikersnaam/login-veld in met: ${credentials.user}`);
    await stagehand.act(`Vul het wachtwoord-veld in met: ${credentials.pass}`);
    await stagehand.act('Klik op de inlog-knop');
    await page.waitForLoadState('networkidle', 10000).catch(() => {});

    // 3. "Kies een verkoper" — default doorgaan (P.J. Pellis)
    await stagehand.act('Klik op de knop "Ga verder" om de standaard verkoper te bevestigen');
    await page.waitForLoadState('networkidle', 8000).catch(() => {});

    // 4. We staan nu op de Configurator (calculator/geel/models) met merken-grid
    await stagehand.act(`Klik op het merk-logo of de merk-tegel van ${tender.merk} in de merkenlijst`);
    await page.waitForLoadState('networkidle', 5000).catch(() => {});

    // 5. Model selecteren
    await stagehand.act(`Klik op het model ${tender.model} (let op de specifieke uitvoering/motor als die er ook bij staat)`);
    await page.waitForLoadState('networkidle', 5000).catch(() => {});

    // 6. Uitvoering / trim (indien meerdere)
    if (tender.uitvoering) {
      await stagehand.act(`Selecteer de uitvoering of trim: ${tender.uitvoering}`);
      await page.waitForLoadState('networkidle', 3000).catch(() => {});
    }

    // 7. Kleur
    if (tender.kleur) {
      await stagehand.act(`Kies de kleur die het meest overeenkomt met: ${tender.kleur}`);
    }

    // 5. Looptijd / km
    await stagehand.act(`Stel de looptijd in op ${tender.looptijd} maanden`);
    await stagehand.act(`Stel kilometers per jaar in op ${tender.km_jaar}`);

    // 6. Opties
    for (const optie of tender.opties) {
      await stagehand.act(
        `Vink de optie/accessoire aan die overeenkomt met: ${optie.naam}` +
          (optie.prijs ? ` (prijs ongeveer €${optie.prijs})` : ''),
      );
    }

    // 7. Norm-instellingen
    if (tender.leasenorm.winterbanden) {
      await stagehand.act(`Selecteer winterbanden-optie: ${tender.leasenorm.winterbanden}`);
    }
    if (tender.leasenorm.vervangend_vervoer) {
      await stagehand.act(`Selecteer vervangend vervoer: ${tender.leasenorm.vervangend_vervoer}`);
    }
    if (tender.leasenorm.eigen_risico) {
      await stagehand.act(`Selecteer eigen risico: ${tender.leasenorm.eigen_risico}`);
    }

    // 8. Bereken en haal prijs op
    await stagehand.act('Klik op berekenen of toon prijs');
    await page.waitForLoadState('networkidle', 5000).catch(() => {});

    const extracted = await stagehand.extract(
      'Haal de maandelijkse leaseprijs op (in euros). Pak alleen het bedrag dat duidelijk als "leaseprijs per maand" wordt aangeduid.',
      z.object({
        maandprijs: z.number().describe('Bedrag per maand in euro'),
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
