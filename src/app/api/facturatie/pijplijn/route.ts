// GET /api/facturatie/pijplijn — orderboek/forecast: alle geparkeerde (pijplijn-)facturen met
// hun after-sales-fase en verwachte leverdatum. Read-only. Auth: Facturatie-medewerker.
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AsRow = {
  id: string; aangevraagd: boolean | null; transport_status: string | null;
  transportdatum: string | null; binnen: boolean | null; klaar: boolean | null;
};

export type PijplijnFase = 'ongekoppeld' | 'nieuw' | 'aangevraagd' | 'onderweg' | 'binnen' | 'rijklaar';

function bepaalFase(as: AsRow | null): PijplijnFase {
  if (!as) return 'ongekoppeld';
  if (as.klaar) return 'rijklaar';
  if (as.binnen) return 'binnen';
  if (as.transport_status && as.transport_status.trim()) return 'onderweg';
  if (as.aangevraagd) return 'aangevraagd';
  return 'nieuw';
}

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;

  const { data: facturen, error } = await supabaseAdmin
    .from('uitgaande_facturen')
    .select('id, klant_naam, voertuig, after_sales_id, totaal_incl')
    .eq('status', 'pijplijn')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const asIds = (facturen ?? []).map((f) => f.after_sales_id).filter(Boolean) as string[];
  const asMap = new Map<string, AsRow>();
  if (asIds.length) {
    const { data: asRows } = await supabaseAdmin
      .from('after_sales')
      .select('id, aangevraagd, transport_status, transportdatum, binnen, klaar')
      .in('id', asIds);
    for (const a of (asRows ?? []) as AsRow[]) asMap.set(a.id, a);
  }

  const items = (facturen ?? []).map((f) => {
    const as = f.after_sales_id ? asMap.get(f.after_sales_id) ?? null : null;
    const v = (f.voertuig ?? {}) as { merk?: string; model?: string; toe_te_betalen?: number };
    return {
      id: f.id,
      klant: f.klant_naam ?? null,
      merk: v.merk ?? null,
      model: v.model ?? null,
      bedrag: v.toe_te_betalen ?? f.totaal_incl ?? null,
      gekoppeld: !!as,
      transportdatum: as?.transportdatum ?? null,
      transport_status: as?.transport_status ?? null,
      fase: bepaalFase(as),
    };
  });

  return NextResponse.json({ items });
}
