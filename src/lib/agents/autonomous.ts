import { z } from 'zod';
import type { TenderInput, LeasePortaal } from '@/lib/types/tender';
import type { AgentContext, AgentResult } from './types';
import { createStagehand, checkAgentEnv, waitForText } from './stagehand-factory';

/**
 * Generieke autonome portaal-agent.
 *
 * In plaats van per portaal een lange reeks handgecodeerde act()-stappen,
 * doen we hier twee dingen:
 *   1. Deterministische login (locator.fill — betrouwbaarder dan de LLM voor
 *      bekende velden, en houdt wachtwoorden uit de model-prompt).
 *   2. Eén autonome agent-run (`stagehand.agent().execute()`) die met de missie
 *      + tender-data de hele calculatie zelf uitvoert en de maandprijs teruggeeft.
 *
 * Een nieuw portaal toevoegen = een nieuwe PortalConfig schrijven (login-selectors
 * + missie-tekst), geen nieuwe 250-regel-agent.
 *
 * Modus (STAGEHAND_AGENT_MODE, default 'cua'):
 *   - 'cua'    : Computer-Use-Agent — Claude bestuurt de browser via screenshots
 *                (zoals browser-use). Robuust bij iframes / rare SPA-DOM, want het
 *                "ziet" gewoon het scherm. Iets duurder (screenshot per stap).
 *   - 'dom'    : werkt via de accessibility-tree (act/fillForm). Goedkoper, maar
 *                worstelt met iframes.
 *   - 'hybrid' : coördinaat-tools + DOM gemengd.
 */

export interface PortalLoginConfig {
  /** Velden die we deterministisch invullen vóór de agent start. */
  fields: { selector: string; valueFrom: 'user' | 'pass' }[];
  /** Instructie voor de submit-klik (via stagehand.act). */
  submitInstruction: string;
  /** Tekst(en) die zichtbaar moeten worden om login geslaagd te verklaren. */
  ready: string[];
  /** Optionele extra wachttijd (ms) na page.goto voordat we velden invullen. */
  settleMs?: number;
}

export interface PortalConfig {
  portaal: LeasePortaal;
  login: PortalLoginConfig;
  /** Bouwt de missie-instructie voor de autonome agent uit de tender. */
  buildMission: (tender: TenderInput) => string;
  /** Optionele DOM-fallback om de prijs af te lezen als de agent-output ontbreekt. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPriceFromDom?: (page: any) => Promise<number | null>;
}

const ResultSchema = z.object({
  maandprijs: z
    .number()
    .describe(
      'Het maandbedrag van de full operational lease in hele euros. ' +
        'NIET de fiscale waarde, cataloguswaarde of prijs per kilometer.',
    ),
  gelukt: z.boolean().describe('true als de volledige calculatie is afgerond, false als er stappen mislukten'),
  toelichting: z.string().describe('Korte toelichting: wat is gedaan, welke opties niet gevonden, eventuele afwijkingen'),
});

export async function runAutonomousAgent(ctx: AgentContext, config: PortalConfig): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials, signal } = ctx;
  const { portaal } = config;

  const envError = checkAgentEnv();
  if (envError) {
    return { portaal, status: 'failed', error_message: envError, duration_ms: Date.now() - start };
  }

  const mode = (process.env.STAGEHAND_AGENT_MODE ?? 'cua') as 'cua' | 'dom' | 'hybrid';
  const agentModel = process.env.STAGEHAND_AGENT_MODEL ?? 'anthropic/claude-sonnet-4-6';
  const maxSteps = Number(process.env.STAGEHAND_AGENT_MAXSTEPS ?? 60);

  const stagehand = createStagehand();

  try {
    await stagehand.init();
    const page = await stagehand.context.newPage();

    // ── 1. Login (deterministisch) ──
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.login.settleMs ?? 3000);

    for (const field of config.login.fields) {
      const value = field.valueFrom === 'user' ? credentials.user : credentials.pass;
      await page.locator(field.selector).fill(value);
    }
    await stagehand.act(config.login.submitInstruction);

    const ingelogd = await waitForText(page, config.login.ready, 20000);
    if (!ingelogd) {
      throw new Error(`Login mislukt — verwachtte een van [${config.login.ready.join(', ')}] na inloggen`);
    }

    // ── 2. Autonome agent voert de hele calculatie uit ──
    // CUA-modus (vision) ondersteunt GEEN output-schema → in dat geval lezen we
    // de prijs uit de DOM (readPriceFromDom). dom/hybrid wél → structured output.
    const supportsOutput = mode !== 'cua';
    const agent = stagehand.agent({ mode, model: agentModel });
    const run = await agent.execute({
      instruction: config.buildMission(tender),
      ...(supportsOutput ? { output: ResultSchema } : {}),
      maxSteps,
      signal,
    });

    const output = supportsOutput ? (run.output as z.infer<typeof ResultSchema> | undefined) : undefined;
    let maandprijs = output?.maandprijs ?? null;

    // DOM-fallback als de agent geen (geldige) prijs teruggaf.
    if ((maandprijs === null || maandprijs === 0) && config.readPriceFromDom) {
      maandprijs = await config.readPriceFromDom(page);
    }

    const gelukt = run.success && output?.gelukt !== false && maandprijs !== null && maandprijs > 0;

    return {
      portaal,
      status: gelukt ? 'completed' : 'failed',
      maandprijs: maandprijs ?? 0,
      error_message: gelukt ? undefined : output?.toelichting ?? run.message ?? 'Calculatie niet afgerond',
      raw: {
        agent_message: run.message,
        agent_success: run.success,
        agent_toelichting: output?.toelichting,
        stappen: run.actions?.length,
        usage: run.usage,
        mode,
        model: agentModel,
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
  } finally {
    await stagehand.close().catch(() => {});
  }
}
