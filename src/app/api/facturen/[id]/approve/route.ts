// Dunne switch-router: routeert naar per-type handler op basis van documenttype.
// Handlers staan in src/lib/documentenstroom/approve/*.ts.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { approveFactuur } from '@/lib/documentenstroom/approve/factuur';
import { approveBestelbevestiging } from '@/lib/documentenstroom/approve/bestelbevestiging';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: factuur, error: leesErr } = await admin
    .from('facturen').select('*').eq('id', id).single();

  if (leesErr || !factuur) {
    return NextResponse.json({ error: 'Document niet gevonden' }, { status: 404 });
  }

  try {
    const documenttype = (factuur.documenttype ?? 'factuur') as string;

    let result: { companyId: string | null; contactId: string | null; dealId: string };

    if (documenttype === 'bestelbevestiging') {
      result = await approveBestelbevestiging(factuur, admin);
    } else if (documenttype === 'inzetbevestiging') {
      return NextResponse.json(
        { error: 'Inzetbevestiging: beschikbaar na Fase 3' },
        { status: 501 },
      );
    } else if (documenttype === 'autokosten') {
      return NextResponse.json(
        { error: 'Autokosten: beschikbaar na Fase 4' },
        { status: 501 },
      );
    } else {
      result = await approveFactuur(factuur, admin);
    }

    const { error: updateErr } = await admin.from('facturen').update({
      hubspot_company_id: result.companyId,
      hubspot_contact_id: result.contactId,
      hubspot_deal_id: result.dealId,
      hubspot_synced_at: new Date().toISOString(),
      hubspot_error: null,
      status: 'goedgekeurd',
      gearchiveerd: true,
    }).eq('id', id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, hubspot: result });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('document approve fout:', msg);
    await admin.from('facturen').update({
      status: 'gefaald',
      hubspot_error: msg,
    }).eq('id', id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
