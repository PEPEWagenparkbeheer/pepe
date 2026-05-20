// Snel debug-script: alleen navigation + login + screenshot maken
// Run met: node scripts/test-hiltermann.mjs

import { readFileSync } from 'fs';
import { Stagehand } from '@browserbasehq/stagehand';

// Lees env vars uit .env.local
const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const URL = process.env.HILTERMANN_URL;
const USER = process.env.HILTERMANN_USER;
const PASS = process.env.HILTERMANN_PASS;

console.log(`▶ Test Hiltermann agent`);
console.log(`  URL: ${URL}`);
console.log(`  User: ${USER}`);

const stagehand = new Stagehand({
  env: 'BROWSERBASE',
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  verbose: 2,
});

try {
  await stagehand.init();
  console.log(`✓ Stagehand geïnitialiseerd`);
  console.log(`  Browserbase debug URL: ${stagehand.browserbaseDebugURL ?? '(zie dashboard)'}`);

  // 1. Pagina openen
  const page = await stagehand.context.newPage();
  console.log(`✓ Page aangemaakt`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  console.log(`✓ Pagina geladen: ${page.url()}`);
  await page.waitForLoadState('networkidle', 8000).catch(() => {});

  // Wat staat er nu op de pagina?
  const before = await stagehand.extract(
    'Beschrijf wat je op de huidige pagina ziet (titel, formulieren, knoppen). Pak ook de huidige URL.',
  );
  console.log(`\n📄 Pagina-inhoud na laden:`);
  console.log(JSON.stringify(before, null, 2));

  // 2. Inloggen
  console.log(`\n▶ Inloggen...`);
  await stagehand.act(`Vul het login-veld (gebruikersnaam of username) in met: ${USER}`);
  await stagehand.act(`Vul het wachtwoord-veld in met: ${PASS}`);
  await stagehand.act('Klik op de inlog-knop');
  await page.waitForLoadState('networkidle', 10000).catch(() => {});

  // Wat staat er na inloggen?
  const after = await stagehand.extract(
    'Beschrijf wat je nu ziet na inloggen. Welke pagina, welke menu-opties, formulieren?',
  );
  console.log(`\n📄 Pagina-inhoud na login:`);
  console.log(JSON.stringify(after, null, 2));
  console.log(`  URL: ${page.url()}`);

  // 3. Klik "Ga verder" om door verkoper-selectie te komen
  console.log(`\n▶ Verkoper-selectie doorgaan...`);
  await stagehand.act('Klik op de knop "Ga verder"');
  await page.waitForLoadState('networkidle', 8000).catch(() => {});

  const step3 = await stagehand.extract(
    'Beschrijf wat je nu op het scherm ziet: pagina-titel, menu-items, knoppen, formulieren. Probeer specifiek te zoeken naar een optie om een nieuwe lease-aanvraag of auto-configuratie te starten.',
  );
  console.log(`\n📄 Pagina na "Ga verder":`);
  console.log(JSON.stringify(step3, null, 2));
  console.log(`  URL: ${page.url()}`);

  // 4. Navigeer naar nieuwe aanvraag / configurator
  console.log(`\n▶ Nieuwe aanvraag starten...`);
  await stagehand.act('Klik op de menu-optie of knop om een nieuwe lease-aanvraag of calculatie te starten');
  await page.waitForLoadState('networkidle', 8000).catch(() => {});

  const step4 = await stagehand.extract(
    'Beschrijf wat je nu ziet. Is er een formulier om merk/model in te vullen? Welke velden zijn er?',
  );
  console.log(`\n📄 Pagina na klik op nieuwe aanvraag:`);
  console.log(JSON.stringify(step4, null, 2));
  console.log(`  URL: ${page.url()}`);

} catch (e) {
  console.error(`✕ Fout: ${e.message}`);
  console.error(e.stack);
} finally {
  await stagehand.close().catch(() => {});
  console.log(`\n✓ Sessie gesloten`);
}
