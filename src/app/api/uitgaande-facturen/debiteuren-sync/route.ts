// POST /api/uitgaande-facturen/debiteuren-sync
// Bouwt/ververst de lokale Twinfield-debiteuren-index (code, naam, postcode, huisnummer) zodat
// matchen razendsnel kan op naam ÉN postcode+huisnummer. Per call: namen volledig bijwerken +
// adressen ophalen voor een batch (de zoeklijst van Twinfield geeft zelf geen adres). Roep
// herhaald aan tot "resterend" 0 is.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { listAlleDebiteuren, readDebiteur } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 40;

export async function POST(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;

  // 1) Namen (snel) volledig upserten — overschrijft adresvelden niet.
  let totaal = 0;
  try {
    const lijst = await listAlleDebiteuren();
    totaal = lijst.length;
    if (lijst.length) {
      const rows = lijst.map((d) => ({ code: d.code, naam: d.name }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseAdmin.from('twinfield_debiteuren')
          .upsert(rows.slice(i, i + 500), { onConflict: 'code' });
        if (error) return NextResponse.json({ error: `Namen opslaan: ${error.message}` }, { status: 500 });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `Debiteurenlijst ophalen: ${String(e)}` }, { status: 502 });
  }

  // 2) Adressen ophalen voor een batch zonder postcode.
  const { data: teVerrijken } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code').is('postcode', null).limit(BATCH);

  let verrijkt = 0;
  for (const r of teVerrijken ?? []) {
    try {
      const d = await readDebiteur(r.code);
      await supabaseAdmin.from('twinfield_debiteuren').update({
        adres: d.adres || null,
        postcode: d.postcode || '',           // '' = verwerkt (voorkomt eindeloze herhaling)
        plaats: d.plaats || null,
        huisnummer: d.huisnummer || null,
        updated_at: new Date().toISOString(),
      }).eq('code', r.code);
      verrijkt++;
    } catch { /* sla over; volgende sync probeert opnieuw niet (postcode blijft null) */ }
  }

  const { count: resterend } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code', { count: 'exact', head: true }).is('postcode', null);

  return NextResponse.json({ ok: true, totaal, verrijkt, resterend: resterend ?? 0 });
}
