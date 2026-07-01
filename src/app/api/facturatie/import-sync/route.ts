// POST /api/facturatie/import-sync — synct de gekoppelde pijplijn-factuur met de after_sales-data.
// Aangeroepen door de client (after-sales) ná BIN-invoer en rijklaar-melding, en server-side bij
// het koppelen en vanuit de TransConnect-sync. No-op als de auto geen gekoppelde factuur heeft.
// Auth: ingelogde PEPE. Fire-and-forget vanaf de client (mag de UI niet blokkeren).
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { syncAfterSalesNaarFactuur } from '@/lib/factuur/import-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  let afterSalesId = '';
  try {
    const body = await req.json();
    afterSalesId = String(body?.after_sales_id ?? '').trim();
  } catch { /* leeg body */ }
  if (!afterSalesId) return NextResponse.json({ error: 'after_sales_id ontbreekt' }, { status: 400 });

  try {
    const r = await syncAfterSalesNaarFactuur(afterSalesId);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ error: `Sync mislukt: ${String(e)}` }, { status: 500 });
  }
}
