import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { TenderInput, LeasePortaal } from '@/lib/types/tender';
// LET OP: bewust uit ./workflows (SDK-vrij) — @skyvern/client trekt playwright
// mee en dat crasht in een Vercel serverless functie.
import { getSkyvernWorkflowId, startSkyvernWorkflowRun } from '@/lib/agents/skyvern/workflows';

export const runtime = 'nodejs';
// Alleen het stárten van de runs gebeurt hier (fire-and-forget); de runs zelf
// duren 10-40 min en worden door /api/tender/poll afgerond.
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface Body {
  tender_id?: string;
  tender?: TenderInput;
  raw_email?: string;
  portalen?: LeasePortaal[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const portalen: LeasePortaal[] = body.portalen ?? ['hiltermann'];

  // 1. Tender record (insert of update)
  let tenderId = body.tender_id;
  if (!tenderId) {
    if (!body.tender) {
      return NextResponse.json({ error: 'tender_id of tender required' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('tenders')
      .insert({
        klant_naam: body.tender.naam,
        klant_email: body.tender.email,
        raw_email: body.raw_email,
        parsed_data: body.tender,
        leasenorm: body.tender.leasenorm,
        status: 'confirmed',
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    tenderId = data.id;
  } else if (body.tender) {
    // Update bestaande tender met eventuele edits
    await supabaseAdmin
      .from('tenders')
      .update({
        parsed_data: body.tender,
        leasenorm: body.tender.leasenorm,
        status: 'confirmed',
      })
      .eq('id', tenderId);
  }

  // 2. Tender ophalen
  const { data: tender } = await supabaseAdmin
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single();

  if (!tender?.parsed_data) {
    return NextResponse.json({ error: 'Tender geen parsed_data' }, { status: 400 });
  }

  // 3. Per portaal: Skyvern-workflow starten (fire-and-forget) + running-record
  //    met run_id. De /api/tender/poll route werkt de resultaten later bij —
  //    een run duurt langer dan een serverless functie mag draaien.
  await supabaseAdmin.from('tenders').update({ status: 'running' }).eq('id', tenderId);

  const startPromises = portalen.map(async (portaal) => {
    if (!getSkyvernWorkflowId(portaal)) {
      await supabaseAdmin.from('tender_results').insert({
        tender_id: tenderId,
        portaal,
        status: 'failed',
        error_message: `Agent voor ${portaal} nog niet geïmplementeerd`,
      });
      return;
    }

    try {
      const run = await startSkyvernWorkflowRun(portaal, tender.parsed_data as TenderInput);
      await supabaseAdmin.from('tender_results').insert({
        tender_id: tenderId,
        portaal,
        status: 'running',
        started_at: new Date().toISOString(),
        raw_result: {
          skyvern_run_id: run.run_id,
          workflow_id: run.workflow_id,
          app_url: run.app_url ?? null,
        },
      });
    } catch (e) {
      await supabaseAdmin.from('tender_results').insert({
        tender_id: tenderId,
        portaal,
        status: 'failed',
        error_message: (e as Error).message,
      });
    }
  });

  await Promise.allSettled(startPromises);

  // 4. Als geen enkele run is gestart, is de tender meteen klaar (alles failed)
  const { count: lopend } = await supabaseAdmin
    .from('tender_results')
    .select('id', { count: 'exact', head: true })
    .eq('tender_id', tenderId)
    .eq('status', 'running');
  if ((lopend ?? 0) === 0) {
    await supabaseAdmin.from('tenders').update({ status: 'done' }).eq('id', tenderId);
  }

  return NextResponse.json({ ok: true, tender_id: tenderId, runs_gestart: lopend ?? 0 });
}
