// GET /api/uitgaande-facturen/[id]/debiteur-suggesties
// Geeft bestaande Twinfield-debiteuren als match-kandidaten (naam + postcode/huisnummer),
// zodat de gebruiker matcht i.p.v. blind een nieuwe debiteur aan te maken.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { searchDebiteurCandidates } from '@/lib/twinfield/factuur';
import { getCompanyFields } from '@/lib/hubspot';
import type { UitgaandeFactuur } from '@/types/factuur';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const { data: f } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  const factuur = f as UitgaandeFactuur;

  // Reeds gekoppelde debiteurcode: van de factuur zelf of van de HubSpot-company.
  let gekoppeldeCode = factuur.twinfield_debiteur_code ?? null;
  if (!gekoppeldeCode && factuur.hubspot_company_id) {
    const cf = await getCompanyFields(factuur.hubspot_company_id, ['twinfield_debiteur_code']).catch(() => null);
    gekoppeldeCode = (cf?.twinfield_debiteur_code as string) ?? null;
  }

  const huisnummer = factuur.adres?.match(/\d+/)?.[0] ?? null;

  const kandidaten = await searchDebiteurCandidates(factuur.klant_naam ?? '', {
    gekoppeldeCode,
    postcode: factuur.postcode,
    huisnummer,
  });

  return NextResponse.json({ kandidaten, gekoppeldeCode });
}
