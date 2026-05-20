// Test de echte runHiltermann agent met de exacte tender uit de handmatige run.
// Run: npx tsx scripts/test-hiltermann.mts

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

// Forceer LOCAL Chromium voor deze test (eigen IP, geen Browserbase)
process.env.STAGEHAND_ENV = 'LOCAL';

// @ts-expect-error tsx kan .ts importeren
const { runHiltermann } = await import('../src/lib/agents/hiltermann.ts');
type Tender = Parameters<typeof runHiltermann>[0]['tender'];

const tender: Tender = {
  naam: 'Nico Timmerman',
  merk: 'Skoda',
  model: 'Fabia',
  uitvoering: '1.0tsi greentech selection 85kW dsg-7 aut',
  kleur: 'Candy White signaal unilak',
  bekleding: 'Loft',
  looptijd: 48,
  km_jaar: 30000,
  brandstof: 'Benzine',
  prijzen_incl_btw: true,
  opties: [
    { naam: 'Candy White signaal unilak', prijs: 490, type: 'optie' },
    { naam: "Bekleding 'Loft'", prijs: 0, type: 'optie' },
    { naam: 'Sunset (Extra donker getinte ramen achter)', prijs: 190, type: 'optie' },
    { naam: 'Bagagenetten zwart 4-delig', prijs: 63, type: 'accessoire' },
    { naam: 'Dubbelzijdige kofferbak mat', prijs: 78, type: 'accessoire' },
  ],
  leasenorm: {
    winterbanden: 'all_season',
    vervangend_vervoer: '24u',
    eigen_risico: 'laag',
  },
};

console.log('▶ Hiltermann test — verwacht € 609\n');
const t0 = Date.now();
const result = await runHiltermann({
  tender,
  credentials: {
    url: process.env.HILTERMANN_URL!,
    user: process.env.HILTERMANN_USER!,
    pass: process.env.HILTERMANN_PASS!,
  },
});

console.log('\n══════ Resultaat ══════');
console.log(`Maandprijs: € ${result.maandprijs}`);
console.log(`Status:     ${result.status}`);
console.log(`Duur:       ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (result.error_message) console.log(`Error:      ${result.error_message}`);
console.log(`Raw:        ${JSON.stringify(result.raw, null, 2)}`);
