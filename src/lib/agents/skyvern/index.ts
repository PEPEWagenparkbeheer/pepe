import { Skyvern } from '@skyvern/client';
import type { TenderInput, LeasePortaal } from '@/lib/types/tender';
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
 * (proxy_location 'RESIDENTIAL_NL') â€” dat omzeilt naar verwachting de bot-detectie
 * waar Browserbase's datacenter-IP's op faalden (o.a. Hiltermann).
 *
 * âš ï¸ CREDENTIALS â€” FASE 0 vs FASE 1:
 *  - Fase 0 (deze eval): login-gegevens staan in de prompt â†’ ze gaan naar het LLM.
 *    Alleen acceptabel voor een eenmalige eval met je eigen B2B-portaallogin.
 *  - Fase 1 (productie): verplaats naar Skyvern Credentials (vault) + login-block
 *    in een workflow â†’ wachtwoord wordt vervangen door placeholder, nooit naar LLM.
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

  // Login-instructie (Fase 0: creds in prompt â€” zie waarschuwing bovenaan).
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * FASE 1 â€” workflow-runs (deterministisch, goedkoop)
 *
 * De portaal-flows zijn vastgelegd als Skyvern-workflows (explore Ã©Ã©nmalig,
 * daarna replay met `run_with: 'code'` + AI-fallback per blok). Een run duurt
 * 10-40 min â€” veel langer dan een Vercel-functie mag draaien. Daarom:
 *  - `startSkyvernWorkflowRun()`  â†’ start de run en geeft direct run_id terug
 *  - `getSkyvernRunResult()`      â†’ pollt status + parset de maandprijs
 * De /api/tender/poll route werkt hiermee de tender_results asynchroon bij.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const SKYVERN_API = 'https://api.skyvern.com/v1';

/** Portaal â†’ env-var met het gepubliceerde workflow-ID (wpid_â€¦). */
const WORKFLOW_ENV: Partial<Record<LeasePortaal, string>> = {
  hiltermann: 'SKYVERN_WORKFLOW_HILTERMANN',
  arval: 'SKYVERN_WORKFLOW_ARVAL',
};

export function getSkyvernWorkflowId(portaal: LeasePortaal): string | null {
  const envName = WORKFLOW_ENV[portaal];
  return envName ? (process.env[envName] ?? null) : null;
}

export interface SkyvernRunStart {
  run_id: string;
  app_url?: string;
  workflow_id: string;
}

/** Start een workflow-run zonder te wachten op voltooiing (fire-and-forget). */
export async function startSkyvernWorkflowRun(portaal: LeasePortaal): Promise<SkyvernRunStart> {
  const apiKey = process.env.SKYVERN_API_KEY;
  if (!apiKey) throw new Error('SKYVERN_API_KEY ontbreekt');

  const workflowId = getSkyvernWorkflowId(portaal);
  if (!workflowId) {
    throw new Error(`Geen Skyvern-workflow geconfigureerd voor ${portaal} (env ${WORKFLOW_ENV[portaal] ?? 'â€”'})`);
  }

  const res = await fetch(`${SKYVERN_API}/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      run_with: 'code',      // deterministisch replay van het gecachte script
      ai_fallback: true,     // valt per blok terug op de agent als een selector breekt
      proxy_location: 'RESIDENTIAL_NL',
    }),
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => '');
    throw new Error(`Skyvern workflow-start faalde: HTTP ${res.status} ${tekst.slice(0, 300)}`);
  }

  const data = (await res.json()) as { run_id?: string; app_url?: string };
  if (!data.run_id) throw new Error('Skyvern gaf geen run_id terug');
  return { run_id: data.run_id, app_url: data.app_url, workflow_id: workflowId };
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'terminated', 'canceled', 'timed_out']);

export interface SkyvernRunResult {
  status: string;
  terminal: boolean;
  maandprijs: number | null;
  failure_reason?: string;
  app_url?: string;
  /** Alleen de extracted_information â€” de volledige output bevat MB's aan screenshot-URL's. */
  extracted?: unknown;
}

/** Haalt de run-status op en parset de maandprijs uit de workflow-output. */
export async function getSkyvernRunResult(runId: string): Promise<SkyvernRunResult> {
  const apiKey = process.env.SKYVERN_API_KEY;
  if (!apiKey) throw new Error('SKYVERN_API_KEY ontbreekt');

  const res = await fetch(`${SKYVERN_API}/runs/${runId}`, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) throw new Error(`Skyvern run-status faalde: HTTP ${res.status}`);

  const data = (await res.json()) as {
    status?: string;
    output?: unknown;
    failure_reason?: string;
    app_url?: string;
  };
  const status = data.status ?? 'unknown';
  const extracted =
    data.output && typeof data.output === 'object'
      ? ((data.output as Record<string, unknown>).extracted_information ?? null)
      : null;

  return {
    status,
    terminal: TERMINAL_STATUSES.has(status),
    maandprijs: extractMaandprijs(data.output),
    failure_reason: data.failure_reason ?? undefined,
    app_url: data.app_url,
    extracted,
  };
}

/**
 * Zoekt recursief naar `maandprijs_eur` / `maandprijs` in de workflow-output.
 * De extractie-blokken leveren NL-geformatteerde strings ("897,52" / "1.234,56").
 */
export function extractMaandprijs(output: unknown, diepte = 0): number | null {
  if (output == null || diepte > 8) return null;
  if (Array.isArray(output)) {
    for (const item of output) {
      const n = extractMaandprijs(item, diepte + 1);
      if (n !== null) return n;
    }
    return null;
  }
  if (typeof output !== 'object') return null;

  const obj = output as Record<string, unknown>;
  for (const key of ['maandprijs_eur', 'maandprijs']) {
    if (key in obj) {
      const n = parseNlBedrag(obj[key]);
      if (n !== null) return n;
    }
  }
  for (const value of Object.values(obj)) {
    const n = extractMaandprijs(value, diepte + 1);
    if (n !== null) return n;
  }
  return null;
}

/** Parset "897,52" / "1.234,56" / 607 naar een number; null bij onbruikbaar. */
function parseNlBedrag(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.') // NL: punt = duizendtal, komma = decimaal
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

