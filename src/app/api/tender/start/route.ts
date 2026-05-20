import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { TenderInput, LeasePortaal } from '@/lib/types/tender';
import { runHiltermann } from '@/lib/agents/hiltermann';
import { runArval } from '@/lib/agents/arval';
import { getPortaalCredentials } from '@/lib/agents/types';
import type { AgentResult } from '@/lib/agents/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — vereist Vercel Pro

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

const AGENT_MAP: Record<LeasePortaal, ((ctx: any) => Promise<AgentResult>) | null> = {
  hiltermann: runHiltermann,
  alphabet:   null,
  ayvens:     null,
  arval:      runArval,
  mhc:        null,
};

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

  // 2. Tender ophalen voor agents
  const { data: tender } = await supabaseAdmin
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single();

  if (!tender?.parsed_data) {
    return NextResponse.json({ error: 'Tender geen parsed_data' }, { status: 400 });
  }

  // 3. Per portaal: insert pending result + start agent
  await supabaseAdmin.from('tenders').update({ status: 'running' }).eq('id', tenderId);

  const agentPromises = portalen.map(async (portaal) => {
    const agent = AGENT_MAP[portaal];
    if (!agent) {
      await supabaseAdmin.from('tender_results').insert({
        tender_id: tenderId,
        portaal,
        status: 'failed',
        error_message: `Agent voor ${portaal} nog niet geïmplementeerd`,
      });
      return;
    }

    // Insert pending record
    const { data: resultRecord } = await supabaseAdmin
      .from('tender_results')
      .insert({
        tender_id: tenderId,
        portaal,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!resultRecord) return;

    // Run agent
    let result: AgentResult;
    try {
      const credentials = getPortaalCredentials(portaal);
      result = await agent({ tender: tender.parsed_data, credentials });
    } catch (e) {
      result = {
        portaal,
        status: 'failed',
        error_message: (e as Error).message,
        duration_ms: 0,
      };
    }

    // Update result record
    await supabaseAdmin
      .from('tender_results')
      .update({
        status: result.status,
        finished_at: new Date().toISOString(),
        maandprijs: result.maandprijs ?? null,
        transparency_check: result.transparency_check ?? null,
        error_message: result.error_message ?? null,
        raw_result: result.raw ?? null,
      })
      .eq('id', resultRecord.id);
  });

  await Promise.allSettled(agentPromises);

  // 4. Tender afronden
  await supabaseAdmin.from('tenders').update({ status: 'done' }).eq('id', tenderId);

  return NextResponse.json({ ok: true, tender_id: tenderId });
}
