// Maakt screenshots na elke stap zodat we visueel zien wat er gebeurt
// Run met: node scripts/test-hiltermann.mjs
// Screenshots komen in: scripts/debug/step-XX.png

import { readFileSync, mkdirSync } from 'fs';
import { Stagehand } from '@browserbasehq/stagehand';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

mkdirSync('scripts/debug', { recursive: true });

const URL = process.env.HILTERMANN_URL;
const USER = process.env.HILTERMANN_USER;
const PASS = process.env.HILTERMANN_PASS;

let stap = 0;
async function snap(page, label) {
  stap++;
  const file = `scripts/debug/step-${String(stap).padStart(2, '0')}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  await page.screenshot({ path: file, fullPage: true }).catch((e) => console.log(`  ✕ screenshot fout: ${e.message}`));
  console.log(`▶ ${label}\n  URL: ${page.url()}\n  Screenshot: ${file}\n`);
}

const stagehand = new Stagehand({
  env: 'BROWSERBASE',
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  verbose: 0,
});

try {
  await stagehand.init();
  const page = await stagehand.context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', 6000).catch(() => {});
  await snap(page, 'login-pagina');

  // Login
  await stagehand.act(`Vul het login-veld in met: ${USER}`);
  await stagehand.act(`Vul het wachtwoord-veld in met: ${PASS}`);
  await stagehand.act('Klik op de inlog-knop');
  await page.waitForLoadState('networkidle', 8000).catch(() => {});
  await snap(page, 'na-login');

  // Verkoper
  await stagehand.act('Klik op "Ga verder"');
  await page.waitForLoadState('networkidle', 8000).catch(() => {});
  await snap(page, 'configurator-merken');

  // Merk
  await stagehand.act('Klik op het merk-logo van Skoda');
  await page.waitForLoadState('networkidle', 5000).catch(() => {});
  await snap(page, 'modellen-skoda');

  // Model
  await stagehand.act('Klik op het Fabia model');
  await page.waitForLoadState('networkidle', 5000).catch(() => {});
  await snap(page, 'types-fabia');

  // Uitvoering — klik op de prijs-knop in de rij van greentech selection 85kW dsg-7
  await stagehand.act('Klik op de prijs-knop (€-bedrag, donker rond) in de rij van "1.0tsi greentech selection 85kW dsg-7 aut" met prijs vanaf €27.420');
  await page.waitForLoadState('networkidle', 6000).catch(() => {});
  await snap(page, 'na-uitvoering-keuze');

  // Verwachte vervolgstap: configurator met opties / kleur / leasenorm
  await stagehand.act('Klik op een volgende-knop of ga door naar opties als die zichtbaar is');
  await page.waitForLoadState('networkidle', 5000).catch(() => {});
  await snap(page, 'na-volgende');

} catch (e) {
  console.error(`✕ Fout: ${e.message}`);
} finally {
  await stagehand.close().catch(() => {});
  console.log('\n✓ Klaar — open de PNG-bestanden in scripts/debug/');
}
