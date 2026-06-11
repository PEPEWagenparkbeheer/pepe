import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
// LET OP: bewust uit ./workflows (SDK-vrij) — @skyvern/client trekt playwright
// mee en dat crasht in een Vercel serverless functie.
import { getSkyvernRunResult } from '@/lib/agents/skyvern/workflows';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Pollt de lopende Skyvern-runs van een tender en werkt tender_results bij.
 * Wordt door de resultaatpagina elke 30s aangeroepen zolang de tender loopt —
 * de runs zelf duren 10-40 min, langer dan een serverless functie mag draaien.
 */
export async function GET(req: NextRequest) {
  const tenderId = req.nextUrl.searchParams.get('tender_id');
  if (!tenderId) {
    return NextResponse.json({ error: 'tender_id required' }, { status: 400 });
  }

  const { data: lopend, error } = await supabaseAdmin
    .from('tender_results')
    .select('*')
    .eq('tender_id', tenderId)
    .eq('status', 'running');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let bijgewerkt = 0;
  for (const result of lopend ?? []) {
    const raw = (result.raw_result ?? {}) as Record<string, unknown>;
    const runId = typeof raw.skyvern_run_id === 'string' ? raw.skyvern_run_id : null;
    if (!runId) continue; // record zonder run_id (legacy) — laten staan

    try {
      const run = await getSkyvernRunResult(runId);
      if (!run.terminal) continue;

      const gelukt = run.status === 'completed' && run.maandprijs !== null;
      await supabaseAdmin
        .from('tender_results')
        .update({
          status: gelukt ? 'completed' : 'failed',
          finished_at: new Date().toISOString(),
          maandprijs: run.maandprijs,
          error_message: gelukt
            ? null
            : run.failure_reason ??
              `Skyvern status: ${run.status}${run.maandprijs === null ? ' (geen maandprijs in output)' : ''}`,
          raw_result: {
            ...raw,
            skyvern_status: run.status,
            extracted: run.extracted ?? null,
            app_url: run.app_url ?? raw.app_url ?? null,
          },
        })
        .eq('id', result.id);
      bijgewerkt++;
    } catch {
      // Transiente fout (netwerk/rate limit): volgende poll opnieuw proberen
    }
  }

  // Tender afronden zodra er niets meer loopt
  const { count: nogLopend } = await supabaseAdmin
    .from('tender_results')
    .select('id', { count: 'exact', head: true })
    .eq('tender_id', tenderId)
    .eq('status', 'running');

  if ((nogLopend ?? 0) === 0) {
    await supabaseAdmin
      .from('tenders')
      .update({ status: 'done' })
      .eq('id', tenderId)
      .eq('status', 'running');
  }

  return NextResponse.json({ ok: true, bijgewerkt, nog_lopend: nogLopend ?? 0 });
}
