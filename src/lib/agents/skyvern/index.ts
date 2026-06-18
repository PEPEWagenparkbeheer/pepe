import { Skyvern } from '@skyvern/client';
import type { TenderInput } from '@/lib/types/tender';
import type { AgentContext, AgentResult } from '../types';

/**
 * Skyvern-adapter (Fase 0 evaluatie + basis voor Fase 1).
 *
 * Geeft de bestaande `AgentResult`-vorm terug, zodat Skyvern de verwisselbare
 * automatiserings-laag is achter dezelfde grens als de Stagehand-agents
 * (runArval / runHiltermannAuto). Later vervangbaar zonder de app te herschrijven.
 *
 * Skyvern Cloud host de browser zelf (anti-detect + residential proxy), dus er is
 * GEEN eigen runner/Chromium nodig. We gebruiken een Nederlands residential-IP
 * (proxy_location 'RESIDENTIAL_NL') — dat omzeilt naar verwachting de bot-detectie
 * waar Browserbase's datacenter-IP's op faalden (o.a. Hiltermann).
 *
 * âš ï¸ CREDENTIALS — FASE 0 vs FASE 1:
 *  - Fase 0 (deze eval): login-gegevens staan in de prompt → ze gaan naar het LLM.
 *    Alleen acceptabel voor een eenmalige eval met je eigen B2B-portaallogin.
 *  - Fase 1 (productie): verplaats naar Skyvern Credentials (vault) + login-block
 *    in een workflow → wachtwoord wordt vervangen door placeholder, nooit naar LLM.
 */

export interface SkyvernPortalConfig {
  portaal: AgentResult['portaal'];
  /** Optionele override van de start-URL; default credentials.url (uit env). */
  url?: string;
  /** Bouwt de taak-instructie (post-login flow) uit de tender. */
  buildMission: (tender: TenderInput) => string;
  /** Handmatig geverifieerde referentieprijs (voor de eval-poort). */
  verwachtePrijs?: number;
  /** Override proxy-locatie; default Nederlands residential. */
  proxyLocation?: string;
  /** Skyvern-engine; default 'skyvern-2.0' (complexe multi-step taken). */
  engine?: 'skyvern-2.0' | 'skyvern-1.0' | 'openai-cua' | 'anthropic-cua';
}

/** JSON-schema zodat Skyvern een consistente { maandprijs } teruggeeft. */
const PRIJS_SCHEMA = {
  type: 'object',
  properties: {
    maandprijs: {
      type: 'number',
      description:
        'Het maandbedrag van de full operational lease in hele euros. ' +
        'NIET de fiscale waarde, cataloguswaarde of prijs per kilometer.',
    },
    gelukt: {
      type: 'boolean',
      description: 'true als de volledige calculatie is afgerond en de prijs zichtbaar was',
    },
  },
  required: ['maandprijs'],
} as const;

export async function runSkyvernPortal(ctx: AgentContext, config: SkyvernPortalConfig): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;
  const { portaal } = config;

  if (!process.env.SKYVERN_API_KEY) {
    return { portaal, status: 'failed', error_message: 'SKYVERN_API_KEY ontbreekt', duration_ms: Date.now() - start };
  }

  const skyvern = new Skyvern({ apiKey: process.env.SKYVERN_API_KEY });

  // Login-instructie (Fase 0: creds in prompt — zie waarschuwing bovenaan).
  const loginInstructie =
    `Open de inlogpagina en log in met gebruikersnaam "${credentials.user}" en wachtwoord "${credentials.pass}". ` +
    `Wacht tot je bent ingelogd voordat je verder gaat.\n\n`;

  const prompt = loginInstructie + config.buildMission(tender);

  const maxSteps = Number(process.env.SKYVERN_MAX_STEPS ?? 40);
  // SDK-timeout is in SECONDEN (niet minuten). Een portaal-taak duurt enkele minuten.
  const timeoutSec = Number(process.env.SKYVERN_TIMEOUT_SEC ?? 600);

  try {
    const res = await skyvern.runTask({
      body: {
        prompt,
        url: config.url ?? credentials.url,
        engine: config.engine ?? 'skyvern-2.0',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proxy_location: (config.proxyLocation ?? 'RESIDENTIAL_NL') as any,
        max_steps: maxSteps,
        data_extraction_schema: PRIJS_SCHEMA,
      },
      waitForCompletion: true,
      timeout: timeoutSec,
    });

    const output = (res.output ?? {}) as { maandprijs?: number; gelukt?: boolean };
    const maandprijs = typeof output.maandprijs === 'number' ? output.maandprijs : null;
    const gelukt = res.status === 'completed' && maandprijs !== null && maandprijs > 0;

    return {
      portaal,
      status: gelukt ? 'completed' : 'failed',
      maandprijs: maandprijs ?? 0,
      error_message: gelukt ? undefined : res.failure_reason ?? `Skyvern status: ${res.status}`,
      raw: {
        run_id: res.run_id,
        skyvern_status: res.status,
        app_url: res.app_url,
        recording_url: res.recording_url,
        screenshot_urls: res.screenshot_urls,
        step_count: res.step_count,
        output: res.output,
        verwachte_prijs: config.verwachtePrijs,
      },
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    return {
      portaal,
      status: 'failed',
      error_message: (e as Error).message,
      duration_ms: Date.now() - start,
    };
  }
}
