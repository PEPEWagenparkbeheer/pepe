// POST /api/uitgaande-facturen/[id]/crediteer
// Maakt een creditnota-CONCEPT op basis van een bestaande factuur. De gebruiker controleert
// 'm en boekt 'm daarna via /akkoord-verstuur (die credit:true gebruikt o.b.v. soort).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import type { UitgaandeFactuur } from '@/types/factuur';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const { data: f } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  const bron = f as UitgaandeFactuur;

  const insert = {
    type: bron.type,
    soort: 'creditnota',
    status: 'concept',
    credit_van_factuur_id: bron.id,
    hubspot_company_id: bron.hubspot_company_id,
    klant_naam: bron.klant_naam,
    tav: bron.tav,
    adres: bron.adres,
    postcode: bron.postcode,
    plaats: bron.plaats,
    telefoon: bron.telefoon,
    email: bron.email,
    factuur_email: bron.factuur_email,
    kvk: bron.kvk,
    btw_nummer: bron.btw_nummer,
    twinfield_debiteur_code: bron.twinfield_debiteur_code,
    betaaltermijn_dagen: bron.betaaltermijn_dagen,
    regels: bron.regels,
    totaal_excl: bron.totaal_excl,
    totaal_btw: bron.totaal_btw,
    totaal_incl: bron.totaal_incl,
    voertuig: bron.voertuig,
    notitie: `Creditnota op factuur ${bron.factuurnummer ?? bron.id}`,
  };

  const { data, error } = await supabaseAdmin
    .from('uitgaande_facturen').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ factuur: data });
}
