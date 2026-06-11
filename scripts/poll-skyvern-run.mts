// Pollt een Skyvern-run tot een eindstatus en print het resultaat.
// Gebruik: npx tsx scripts/poll-skyvern-run.mts <run_id> [interval_sec]
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const runId = process.argv[2];
const intervalSec = Number(process.argv[3] ?? 60);
if (!runId) { console.log('Gebruik: poll-skyvern-run.mts <run_id> [interval_sec]'); process.exit(1); }

const TERMINAL = new Set(['completed', 'failed', 'terminated', 'canceled', 'timed_out']);
const key = process.env.SKYVERN_API_KEY!;
const t0 = Date.now();

for (;;) {
  const res = await fetch(`https://api.skyvern.com/api/v1/runs/${runId}`, {
    headers: { 'x-api-key': key },
  });
  if (!res.ok) {
    console.log(`HTTP ${res.status} — opnieuw over ${intervalSec}s`);
  } else {
    const d = (await res.json()) as { status?: string; output?: unknown; failure_reason?: string };
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`[${min}m] status: ${d.status}`);
    if (d.status && TERMINAL.has(d.status)) {
      console.log(`failure_reason: ${d.failure_reason ?? '-'}`);
      console.log(`output: ${JSON.stringify(d.output)}`);
      process.exit(d.status === 'completed' ? 0 : 1);
    }
  }
  await new Promise((r) => setTimeout(r, intervalSec * 1000));
}
