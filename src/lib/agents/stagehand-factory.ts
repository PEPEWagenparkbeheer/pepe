import { Stagehand } from '@browserbasehq/stagehand';

/**
 * Gedeelde Stagehand-factory + page-helpers voor alle portaal-agents.
 *
 * STAGEHAND_ENV bepaalt waar de browser draait:
 *  - 'LOCAL': lokale Chromium via Playwright (eigen IP, geen extra kosten,
 *    omzeilt bot-detectie van portalen die Browserbase datacenter-IP's blokkeren)
 *  - anders: Browserbase cloud browser (vereist server die een browser kan draaien)
 *
 * Twee modellen, bewust gesplitst:
 *  - STAGEHAND_MODEL (constructor): gebruikt voor losse act/observe/extract calls
 *    zoals de login-submit. Default goedkoop (Groq).
 *  - STAGEHAND_AGENT_MODEL (agent): gebruikt voor de autonome agent-loop.
 *    Default Claude — veel capabeler in browser-navigatie.
 */
export function createStagehand(): Stagehand {
  const useLocal = process.env.STAGEHAND_ENV === 'LOCAL';
  const model = process.env.STAGEHAND_MODEL ?? 'groq/openai/gpt-oss-120b';

  return useLocal
    ? new Stagehand({
        env: 'LOCAL',
        model,
        verbose: 1,
        localBrowserLaunchOptions: { headless: false },
      })
    : new Stagehand({
        env: 'BROWSERBASE',
        apiKey: process.env.BROWSERBASE_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
        model,
        verbose: 1,
      });
}

/** Controleert of een LLM- en (indien nodig) Browserbase-config aanwezig is. */
export function checkAgentEnv(): string | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return 'Geen LLM API key (ANTHROPIC_API_KEY of GROQ_API_KEY)';
  }
  const useLocal = process.env.STAGEHAND_ENV === 'LOCAL';
  if (!useLocal && (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID)) {
    return 'Browserbase env ontbreekt (zet STAGEHAND_ENV=LOCAL voor lokale Chromium)';
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pageText(page: any): Promise<string> {
  try {
    return await page.evaluate(() => (document.body as HTMLElement).innerText);
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pageHtml(page: any): Promise<string> {
  try {
    return await page.evaluate(() => (document.body as HTMLElement).innerHTML);
  } catch {
    return '';
  }
}

/** Wacht tot een van de patterns in de zichtbare tekst of HTML van de pagina staat. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function waitForText(page: any, patterns: string[], timeoutMs = 15000): Promise<boolean> {
  const eind = Date.now() + timeoutMs;
  while (Date.now() < eind) {
    const [txt, html] = await Promise.all([pageText(page), pageHtml(page)]);
    const combined = (txt + ' ' + html).toLowerCase();
    if (patterns.some((p) => combined.includes(p.toLowerCase()))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}
