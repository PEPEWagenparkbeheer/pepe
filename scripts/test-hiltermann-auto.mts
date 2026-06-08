// Test de autonome Hiltermann-agent (stagehand.agent / CUA-modus).
// Run: npx tsx scripts/test-hiltermann-auto.mts
//
// Vereist in .env.local: ANTHROPIC_API_KEY met credits + HILTERMANN_URL/USER/PASS.
// Draait standaard lokaal (eigen IP) om Hiltermann's bot-detectie te omzeilen.

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

// Lokale Chromium (eigen IP) — Hiltermann blokkeert Browserbase datacenter-IP's.
process.env.STAGEHAND_ENV = 'LOCAL';
// Autonome agent op Claude (veel capabeler in browser-navigatie dan Groq).
process.env.STAGEHAND_AGENT_MODEL ??= 'anthropic/claude-sonnet-4-6';
process.env.STAGEHAND_AGENT_MODE ??= 'cua';

// @ts-expect-error tsx kan .ts importeren
const { runHiltermannAuto } = await import('../src/lib/agents/portals/hiltermann.ts');
type Tender = Parameters<typeof runHiltermannAuto>[0]['tender'];

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

console.log('▶ Hiltermann AUTONOOM — verwacht € 609\n');
const t0 = Date.now();
const result = await runHiltermannAuto({
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
