// GET /api/wagenparkbeheer-config/aantallen — berekent het HUIDIGE aantal rijdende voertuigen per
// configuratie (live uit HubSpot, som over de dochters). Voor de discrepantie-controle vóór versturen.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { getRijdendeDealsForCompany } from '@/lib/hubspot';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;

  const { data: configs } = await supabaseAdmin
    .from('wagenparkbeheer_config').select('id, child_company_ids, laatst_aantal');

  const aantallen: Record<string, number> = {};
  for (const cfg of configs ?? []) {
    const childs: { hubspot_company_id: string }[] = Array.isArray(cfg.child_company_ids) ? cfg.child_company_ids : [];
    let totaal = 0;
    for (const c of childs) {
      const { aantal } = await getRijdendeDealsForCompany(c.hubspot_company_id);
      totaal += aantal;
    }
    aantallen[cfg.id] = totaal;
  }
  return NextResponse.json({ aantallen });
}
