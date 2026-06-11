// Verificatie van de Skyvern "explore → replay" aanpak.
// Bewijst of een opgenomen flow GOEDKOOP + SNEL deterministisch herspeeld kan worden.
//
// Twee stappen:
//   1) EXPLORE (eenmalig, duur): legt de portaal-flow vast als herbruikbare workflow.
//      npx tsx scripts/verify-skyvern-replay.mts explore [hiltermann|arval]
//      → print run_id + app_url. Noteer het workflow_id uit het Skyvern-dashboard
//        (run → bovenin, of Agents → Workflows).
//
//   2) REPLAY (goedkoop + snel, deterministisch): herhaalt die workflow N keer.
//      npx tsx scripts/verify-skyvern-replay.mts replay <workflow_id> 2
//      → meet wandtijd + stappen per run. Credits lees je in het dashboard
//        (vergelijk met de ~1.500 van de explore).
//
// Vereist: SKYVERN_API_KEY + HILTERMANN_URL/_USER/_PASS in .env.local.
// Hobby-tier aangeraden (gratis 1.000 credits is te krap voor explore + replays).

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
// Split op \r?\n zodat Windows CRLF-regeleindes de waarde niet vervuilen
// (anders bleef SKYVERN_API_KEY leeg → 403 Invalid credentials).
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { Skyvern } = await import('@skyvern/client');
// @ts-expect-error tsx kan .ts importeren
const { hiltermannSkyvern, arvalSkyvern } = await import('../src/lib/agents/skyvern/portals.ts');

const skyvern = new Skyvern({ apiKey: process.env.SKYVERN_API_KEY! });
const cmd = (process.argv[2] ?? 'explore').toLowerCase();

type Tender = Parameters<typeof hiltermannSkyvern.buildMission>[0];

// Portaal-keuze voor explore: hiltermann (default) of arval.
const PORTALEN = {
  hiltermann: { config: hiltermannSkyvern, envPrefix: 'HILTERMANN' },
  arval: { config: arvalSkyvern, envPrefix: 'ARVAL' },
} as const;
type PortaalNaam = keyof typeof PORTALEN;

// Echte aanvraag-tender (8 opties, zoals via de UI) zodat de explore klopt.
const TENDER: Tender = {
  naam: 'Nico Timmerman', merk: 'Skoda', model: 'Fabia',
  uitvoering: '1.0tsi greentech selection 85kW dsg-7 aut',
  kleur: 'Candy White signaal unilak', bekleding: 'Loft',
  looptijd: 48, km_jaar: 30000, brandstof: 'Benzine', prijzen_incl_btw: true,
  opties: [
    { naam: 'Candy White signaal unilak', prijs: 490, type: 'optie' },
    { naam: 'Sunset (Extra donker getinte ramen achter)', prijs: 190, type: 'optie' },
    { naam: 'Dorpellijsten', prijs: 131, type: 'accessoire' },
    { naam: 'Bagagenetten zwart 4-delig', prijs: 63, type: 'accessoire' },
    { naam: 'Car Care Pakket', prijs: 52, type: 'accessoire' },
    { naam: 'Dubbele laadbodem kofferruimte', prijs: 92, type: 'accessoire' },
    { naam: 'Protectie Pakket', prijs: 151, type: 'accessoire' },
    { naam: 'Dubbelzijdige kofferbak mat', prijs: 78, type: 'accessoire' },
  ],
  leasenorm: { winterbanden: 'all_season', vervangend_vervoer: '24u', eigen_risico: 'laag' },
};

if (cmd === 'explore') {
  const portaalNaam = ((process.argv[3] ?? 'hiltermann').toLowerCase()) as PortaalNaam;
  const portaal = PORTALEN[portaalNaam];
  if (!portaal) { console.log(`Onbekend portaal "${portaalNaam}". Kies: ${Object.keys(PORTALEN).join(' | ')}`); process.exit(1); }

  const creds = {
    url: process.env[`${portaal.envPrefix}_URL`]!,
    user: process.env[`${portaal.envPrefix}_USER`]!,
    pass: process.env[`${portaal.envPrefix}_PASS`]!,
  };
  if (!creds.url || !creds.user || !creds.pass) {
    console.log(`Ontbrekende env vars: ${portaal.envPrefix}_URL/_USER/_PASS in .env.local`);
    process.exit(1);
  }

  const loginInstructie =
    `Open de inlogpagina en log in met gebruikersnaam "${creds.user}" en wachtwoord "${creds.pass}". ` +
    `Wacht tot je bent ingelogd voordat je verder gaat.\n\n`;
  const prompt = loginInstructie + portaal.config.buildMission(TENDER);

  console.log(`▶ EXPLORE [${portaalNaam}] — legt de flow vast als herbruikbare workflow (publish_workflow)...\n`);
  const t0 = Date.now();
  const res = await skyvern.runTask({
    body: {
      prompt,
      url: creds.url,
      engine: 'skyvern-2.0',
      proxy_location: 'RESIDENTIAL_NL' as any,
      max_steps: 60,
      publish_workflow: true,
    },
    waitForCompletion: true,
    timeout: 3600, // seconden
  });
  console.log(`Klaar in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
  console.log(`run_id:   ${res.run_id}`);
  console.log(`status:   ${res.status}`);
  console.log(`stappen:  ${res.step_count}`);
  console.log(`app_url:  ${res.app_url}`);
  console.log(`output:   ${JSON.stringify(res.output)}`);
  console.log('\n→ Noteer het WORKFLOW_ID uit het dashboard (Agents → Workflows, of bovenin de run).');
  console.log('  Dan: npx tsx scripts/verify-skyvern-replay.mts replay <workflow_id> 2');
} else if (cmd === 'replay') {
  const workflowId = process.argv[3];
  const n = Number(process.argv[4] ?? 2);
  if (!workflowId) { console.log('Geef een workflow_id: ... replay <workflow_id> [n]'); process.exit(1); }

  console.log(`▶ REPLAY — workflow ${workflowId}, ${n}× deterministisch (run_with: code + ai_fallback)\n`);
  for (let i = 1; i <= n; i++) {
    const t0 = Date.now();
    const res = await skyvern.runWorkflow({
      body: {
        workflow_id: workflowId,
        run_with: 'code',
        ai_fallback: true,
        proxy_location: 'RESIDENTIAL_NL' as any,
      },
      waitForCompletion: true,
      timeout: 1200,
    });
    const min = ((Date.now() - t0) / 1000 / 60).toFixed(1);
    console.log(`Replay ${i}/${n}: ${res.status} — ${min} min, ${res.step_count ?? '?'} stappen`);
    console.log(`   app_url: ${res.app_url}`);
    console.log(`   output:  ${JSON.stringify(res.output)}`);
  }
  console.log('\n→ Vergelijk credits in het dashboard: explore (~1.500) vs deze replays.');
  console.log('  Zijn de replays fors goedkoper + sneller? Dan is "instellen en het draait" bewezen.');
} else {
  console.log('Gebruik: explore [hiltermann|arval]  |  replay <workflow_id> [n]');
}
