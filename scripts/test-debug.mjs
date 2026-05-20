import { readFileSync } from 'fs';
import { Stagehand } from '@browserbasehq/stagehand';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const stagehand = new Stagehand({
  env: 'BROWSERBASE', apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID, verbose: 0,
});

try {
  await stagehand.init();
  const page = await stagehand.context.newPage();
  await page.goto(process.env.HILTERMANN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('input[placeholder="Gebruikersnaam"]').fill(process.env.HILTERMANN_USER);
  await page.locator('input[placeholder="Wachtwoord"]').fill(process.env.HILTERMANN_PASS);
  await stagehand.act('Klik op de "Inloggen" knop');
  await page.waitForTimeout(5000);
  await stagehand.act('Klik op "Ga verder"');

  // Pol 30 seconden, log elke 5 sec wat er op pagina staat
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(5000);
    const text = await page.evaluate(() => document.body.innerText);
    const heeftSkoda = (await page.evaluate(() => document.body.innerHTML)).toLowerCase().includes('skoda');
    console.log(`\n──── Na ${i * 5}s ────`);
    console.log(`URL: ${page.url()}`);
    console.log(`Bevat Skoda (HTML): ${heeftSkoda}`);
    console.log(`Innertext eind: ${text.slice(-200)}`);
  }

  await page.screenshot({ path: 'scripts/debug/dbg-final.png', fullPage: true });
} catch (e) {
  console.error('Fout:', e.message);
} finally {
  await stagehand.close().catch(() => {});
}
