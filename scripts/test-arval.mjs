// Arval debug — login + screenshots
// Run: node scripts/test-arval.mjs

import { readFileSync, mkdirSync } from 'fs';
import { Stagehand } from '@browserbasehq/stagehand';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
mkdirSync('scripts/debug', { recursive: true });

const URL = process.env.ARVAL_URL;
const USER = process.env.ARVAL_USER;
const PASS = process.env.ARVAL_PASS;

let i = 0;
async function snap(page, label) {
  i++;
  const file = `scripts/debug/arval-${String(i).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`▶ ${label}  →  ${file}\n  URL: ${page.url()}`);
}

async function pageText(page) {
  try { return await page.evaluate(() => document.body.innerText); }
  catch { return ''; }
}

const stagehand = new Stagehand({
  env: 'LOCAL',
  model: 'groq/openai/gpt-oss-120b',
  verbose: 0,
  localBrowserLaunchOptions: { headless: false },
});

try {
  await stagehand.init();
  const page = await stagehand.context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await snap(page, 'login-pagina');

  // Cookie-banner wegklikken
  await stagehand.act('Klik op "Alle cookies accepteren" in de cookie-banner').catch(() => {});
  await page.waitForTimeout(2000);
  await snap(page, 'na-cookies');

  // Direct via locator de velden vullen (placeholder/label heuristic)
  // Het formulier heeft een email-veld en een password-veld
  await page.locator('input[type="email"]').fill(USER).catch(async () => {
    // Fallback: eerste text input
    await page.locator('input[type="text"]').first().fill(USER);
  });
  await page.locator('input[type="password"]').fill(PASS);
  await snap(page, 'velden-gevuld');

  await stagehand.act('Klik op de SUBMIT knop om in te loggen');
  await page.waitForTimeout(6000);
  await snap(page, 'na-login');

  // Kies PEPE Holding rol
  await stagehand.act('Klik op de rij "PEPE Holding B.V." in de SELECTEER ROL lijst');
  await page.waitForTimeout(6000);
  await snap(page, 'na-rol-pepe');

  // Start nieuwe offerte via directe DOM-click (geen LLM)
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'));
    const el = els.find((e) => /nieuwe offerte/i.test(e.textContent || e.value || ''));
    if (el) el.click();
  });
  await page.waitForTimeout(6000);
  await snap(page, 'nieuwe-offerte');

  const t = await pageText(page);
  console.log(`\nPagina nieuwe offerte (eerste 1500 chars):\n${t.slice(0, 1500)}\n`);

} catch (e) {
  console.error(`✕ Fout: ${e.message}`);
} finally {
  await stagehand.close().catch(() => {});
}
