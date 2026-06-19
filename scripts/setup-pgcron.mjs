// Eenmalig: zet de 5-min-cron op via Supabase pg_cron + pg_net.
// Roept elke 5 min /api/brein/cron aan met de Bearer CRON_SECRET.
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? '')
  .trim()
  .replace(/^["']|["']$/g, '');
const SECRET = readFileSync('C:/Users/JoepvandenBergh/.pepe_cron_secret.tmp', 'utf8').trim();
const REF = 'rvyiacwachanliukpaqh';

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out));
  return out;
}

// pg_net request-body mag het secret niet in plaintext laten rondslingeren in logs,
// maar in cron.job (alleen admin/service-role) is acceptabel.
const command = `select net.http_get(
  url := 'https://flow.pepewagenparkbeheer.nl/api/brein/cron',
  headers := jsonb_build_object('Authorization', 'Bearer ${SECRET}'),
  timeout_milliseconds := 120000
);`;

await q('create extension if not exists pg_net;');
console.log('✓ pg_net');
await q('create extension if not exists pg_cron;');
console.log('✓ pg_cron');

// Idempotent: verwijder bestaande job met dezelfde naam, dan opnieuw plannen.
await q(`select cron.unschedule('brein-leads-5min') where exists (select 1 from cron.job where jobname='brein-leads-5min');`).catch(() => {});
const r = await q(`select cron.schedule('brein-leads-5min', '*/5 * * * *', $job$ ${command} $job$);`);
console.log('✓ cron.schedule →', JSON.stringify(r));

const jobs = await q(`select jobid, schedule, active, jobname from cron.job where jobname='brein-leads-5min';`);
console.log('Job:', JSON.stringify(jobs));
