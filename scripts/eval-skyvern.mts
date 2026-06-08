// Fase 0 — Skyvern-evaluatie. Draait een portaal-taak N keer en meet tegen de
// handmatig geverifieerde referentieprijs.
//
// Gebruik:
//   npx tsx scripts/eval-skyvern.mts hiltermann 3
//   npx tsx scripts/eval-skyvern.mts arval 3
//   npx tsx scripts/eval-skyvern.mts both 5
//
// Vereist in .env.local:
//   SKYVERN_API_KEY=...            (van app.skyvern.com → Settings → API Keys)
//   HILTERMANN_URL/_USER/_PASS     (en/of ARVAL_URL/_USER/_PASS)
// Optioneel:
//   SKYVERN_MAX_STEPS=40  SKYVERN_TIMEOUT_MIN=15

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const portaalArg = (process.argv[2] ?? 'hiltermann').toLowerCase();
const runs = Number(process.argv[3] ?? 3);

// @ts-expect-error tsx kan .ts importeren
const { runSkyvernPortal } = await import('../src/lib/agents/skyvern/index.ts');
// @ts-expect-error tsx kan .ts importeren
const { hiltermannSkyvern, arvalSkyvern } = await import('../src/lib/agents/skyvern/portals.ts');

type Tender = Parameters<typeof runSkyvernPortal>[0]['tender'];

const TENDER: Tender = {
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
  leasenorm: { winterbanden: 'all_season', vervangend_vervoer: '24u', eigen_risico: 'laag' },
};

const PORTALEN: Record<string, { config: any; envPrefix: string }> = {
  hiltermann: { config: hiltermannSkyvern, envPrefix: 'HILTERMANN' },
  arval: { config: arvalSkyvern, envPrefix: 'ARVAL' },
};

async function evalPortaal(key: string) {
  const entry = PORTALEN[key];
  if (!entry) { console.log(`Onbekend portaal: ${key}`); return; }
  const credentials = {
    url: process.env[`${entry.envPrefix}_URL`]!,
    user: process.env[`${entry.envPrefix}_USER`]!,
    pass: process.env[`${entry.envPrefix}_PASS`]!,
  };
  const referentie = entry.config.verwachtePrijs;
  console.log(`\n═══════════ ${key.toUpperCase()} — referentie ~€${referentie}, ${runs} runs ═══════════`);
  console.log('Let op: leaseprijzen fluctueren (kan €50 schelen). Beoordeel correctheid via de');
  console.log('opname/screenshots, niet op exacte prijs. Telt: voltooide flow + plausibele prijs.\n');

  let voltooid = 0;
  for (let i = 1; i <= runs; i++) {
    const t0 = Date.now();
    const r = await runSkyvernPortal({ tender: TENDER, credentials }, entry.config);
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    const prijs = r.maandprijs ?? 0;
    const ok = r.status === 'completed' && prijs > 0;
    if (ok) voltooid++;
    const delta = prijs > 0 ? `(Δ ref ${prijs - referentie >= 0 ? '+' : ''}${prijs - referentie})` : '';
    console.log(
      `Run ${i}/${runs}: €${prijs} ${delta} ${ok ? '✅ voltooid' : '❌ ' + r.status} (${dt}s, ${r.raw?.step_count ?? '?'} stappen)`,
    );
    if (r.error_message) console.log(`   ⚠ ${r.error_message}`);
    if (r.raw?.app_url) console.log(`   🔗 bekijk run (controleer opties/provisie/looptijd): ${r.raw.app_url}`);
    if (r.raw?.recording_url) console.log(`   🎬 opname: ${r.raw.recording_url}`);
  }
  console.log(`\n→ ${key}: ${voltooid}/${runs} flows voltooid met prijs. Open de run-links en check of`);
  console.log('   de juiste opties/provisie/looptijd zijn gezet — dát bepaalt of de poort open gaat.');
}

const keys = portaalArg === 'both' ? ['hiltermann', 'arval'] : [portaalArg];
for (const k of keys) await evalPortaal(k);
console.log('\nKlaar. Bekijk de run-links hierboven voor screenshots/opnames bij twijfel.');
