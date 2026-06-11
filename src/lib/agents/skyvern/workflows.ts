import type { LeasePortaal } from '@/lib/types/tender';

/* ────────────────────────────────────────────────────────────────────────────
 * FASE 1 — workflow-runs (deterministisch, goedkoop)
 *
 * De portaal-flows zijn vastgelegd als Skyvern-workflows (explore éénmalig,
 * daarna replay met `run_with: 'code'` + AI-fallback per blok). Een run duurt
 * 10-40 min — veel langer dan een Vercel-functie mag draaien. Daarom:
 *  - `startSkyvernWorkflowRun()`  → start de run en geeft direct run_id terug
 *  - `getSkyvernRunResult()`      → pollt status + parset de maandprijs
 * De /api/tender/poll route werkt hiermee de tender_results asynchroon bij.
 *
 * ⚠️ BEWUST GEEN @skyvern/client IMPORT: de SDK trekt playwright mee en dat
 * crasht in een Vercel serverless functie ("Cannot find module browsers.json").
 * Pure REST is hier voldoende — zelfde endpoint als de SDK (/v1/run/workflows).
 * ──────────────────────────────────────────────────────────────────────────── */

const SKYVERN_API = 'https://api.skyvern.com/v1';

/** Portaal → env-var met het gepubliceerde workflow-ID (wpid_…). */
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

/** Start een workflow-run zonder te wachten op voltooiing; run_id wordt opgeslagen en gepolld. */
export async function startSkyvernWorkflowRun(portaal: LeasePortaal): Promise<SkyvernRunStart> {
  const apiKey = process.env.SKYVERN_API_KEY;
  if (!apiKey) throw new Error('SKYVERN_API_KEY ontbreekt');

  const workflowId = getSkyvernWorkflowId(portaal);
  if (!workflowId) {
    throw new Error(`Geen Skyvern-workflow geconfigureerd voor ${portaal} (env ${WORKFLOW_ENV[portaal] ?? '—'})`);
  }

  // Zelfde endpoint + body als de SDK's runWorkflow (bewezen in verify-script).
  const res = await fetch(`${SKYVERN_API}/run/workflows`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_id: workflowId,
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
  /** Alleen de extracted_information — de volledige output bevat MB's aan screenshot-URL's. */
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
