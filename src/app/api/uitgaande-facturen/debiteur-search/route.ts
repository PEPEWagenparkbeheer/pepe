// GET /api/uitgaande-facturen/debiteur-search?q=  — live Twinfield-debiteuren zoeken (autocomplete)
// Gebruikt de lokale index (snel). Index leeg → fallback naar live Twinfield-zoek.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { finderSearch } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ resultaten: [] });

  // Lokale index (naam of code bevat q)
  const { data: rows } = await supabaseAdmin
    .from('twinfield_debiteuren')
    .select('code, naam')
    .or(`naam.ilike.%${q}%,code.ilike.%${q}%`)
    .limit(25);

  if (rows && rows.length) {
    return NextResponse.json({ resultaten: rows.map((r) => ({ code: r.code, naam: r.naam ?? '' })) });
  }

  // Fallback: index nog leeg of geen treffer → live Twinfield
  try {
    const items = await finderSearch('DEB', q, 25);
    return NextResponse.json({ resultaten: items.map((i) => ({ code: i.code, naam: i.name })) });
  } catch (e) {
    return NextResponse.json({ error: String(e), resultaten: [] }, { status: 502 });
  }
}
