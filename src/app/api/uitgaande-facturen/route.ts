// GET  /api/uitgaande-facturen        — lijst (filters: ?status= &type=)
// POST /api/uitgaande-facturen         — nieuwe (concept) factuur aanmaken
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel } from '@/types/factuur';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');

  let q = supabaseAdmin
    .from('uitgaande_facturen')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('type', type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facturen: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const regels: FactuurRegel[] = Array.isArray(body.regels) ? body.regels : [];
  const totalen = berekenTotalen(regels);

  const insert = {
    type: body.type ?? 'diensten_overig',
    soort: body.soort ?? 'factuur',
    status: body.status ?? 'concept',
    handelsconditie: body.handelsconditie ?? false,
    hubspot_company_id: body.hubspot_company_id ?? null,
    twinfield_debiteur_code: body.twinfield_debiteur_code ?? null,
    klant_naam: body.klant_naam ?? null,
    tav: body.tav ?? null,
    adres: body.adres ?? null,
    postcode: body.postcode ?? null,
    plaats: body.plaats ?? null,
    telefoon: body.telefoon ?? null,
    email: body.email ?? null,
    factuur_email: body.factuur_email ?? null,
    kvk: body.kvk ?? null,
    btw_nummer: body.btw_nummer ?? null,
    betaaltermijn_dagen: body.betaaltermijn_dagen ?? 14,
    regels,
    totaal_excl: totalen.totaal_excl,
    totaal_btw: totalen.totaal_btw,
    totaal_incl: totalen.totaal_incl,
    voertuig: body.voertuig ?? null,
    bijlage: body.bijlage ?? null,
    bron: body.bron ?? 'handmatig',
    docusign_envelope_id: body.docusign_envelope_id ?? null,
    periode: body.periode ?? null,
    recurring_key: body.recurring_key ?? null,
    notitie: body.notitie ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('uitgaande_facturen')
    .insert(insert)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ factuur: data });
}
