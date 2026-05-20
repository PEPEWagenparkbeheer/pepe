import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Hiltermann agent — template voor de andere 4 portalen.
 *
 * Workflow:
 * 1. Inloggen
 * 2. Configurator openen
 * 3. Auto + uitvoering + kleur kiezen
 * 4. Looptijd / km
 * 5. Opties aanvinken
 * 6. Norm-instellingen (winterbanden / vervangend vervoer / eigen risico)
 * 7. Maandprijs extracten
 *
 * Stagehand's `act()` laat Claude zelf de juiste velden/knoppen op de pagina
 * vinden — geen hardcoded selectors nodig. Bij nieuwe portalen meestal alleen
 * deze module kopiëren en URL/wording aanpassen.
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
      error_message: 'ANTHROPIC_API_KEY ontbreekt in env (Stagehand gebruikt Claude voor AI-acties)',
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

    // 1. Inloggen
    await stagehand.act(`Open de pagina ${credentials.url}`);
    await stagehand.act(`Vul gebruikersnaam in: ${credentials.user}`);
    await stagehand.act(`Vul wachtwoord in: ${credentials.pass}`);
    await stagehand.act('Klik op de inlog-knop');

    // 2. Configurator openen
    await stagehand.act('Navigeer naar de auto-configurator of nieuwe-aanvraag pagina');

    // 3. Auto selecteren
    await stagehand.act(`Selecteer merk: ${tender.merk}`);
    await stagehand.act(`Selecteer model: ${tender.model}`);
    if (tender.uitvoering) {
      await stagehand.act(`Selecteer uitvoering / trim: ${tender.uitvoering}`);
    }
    if (tender.kleur) {
      await stagehand.act(`Kies de kleur die het meest overeenkomt met: ${tender.kleur}`);
    }

    // 4. Looptijd / km
    await stagehand.act(`Stel de looptijd in op ${tender.looptijd} maanden`);
    await stagehand.act(`Stel kilometers per jaar in op ${tender.km_jaar}`);

    // 5. Opties
    for (const optie of tender.opties) {
      await stagehand.act(
        `Vink de optie/accessoire aan die overeenkomt met: ${optie.naam}` +
          (optie.prijs ? ` (prijs ongeveer €${optie.prijs})` : ''),
      );
    }

    // 6. Norm-instellingen
    if (tender.leasenorm.winterbanden) {
      await stagehand.act(`Selecteer winterbanden-optie: ${tender.leasenorm.winterbanden}`);
    }
    if (tender.leasenorm.vervangend_vervoer) {
      await stagehand.act(`Selecteer vervangend vervoer: ${tender.leasenorm.vervangend_vervoer}`);
    }
    if (tender.leasenorm.eigen_risico) {
      await stagehand.act(`Selecteer eigen risico: ${tender.leasenorm.eigen_risico}`);
    }

    // 7. Bereken en haal prijs op
    await stagehand.act('Klik op berekenen of toon prijs');

    const extracted = await stagehand.extract(
      'Haal de maandelijkse leaseprijs op (in euros)',
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
