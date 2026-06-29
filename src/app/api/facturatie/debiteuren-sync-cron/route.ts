// GET /api/facturatie/debiteuren-sync-cron — Vercel Cron (dagelijks). Houdt de Twinfield-debiteuren-index
// automatisch actueel: namen bijwerken (nieuwe debiteuren) + adressen aanvullen binnen een tijdbudget,
// netjes gethrottled tegen de rate limit. Auth: Bearer/?secret=CRON_SECRET of ingelogde PEPE.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { listAlleDebiteuren, readDebiteur } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BUDGET_MS = 48000;
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!(CRON_SECRET && (secret === CRON_SECRET || bearer === CRON_SECRET))) {
    const gate = await requireFacturatie(req);
    if (!gate.ok) return gate.response;
  }

  const start = Date.now();
  let verrijkt = 0;

  // 1) Namen bijwerken (nieuwe debiteuren erbij).
  try {
    const lijst = await listAlleDebiteuren();
    for (let i = 0; i < lijst.length; i += 500) {
      const rows = lijst.slice(i, i + 500).map((d) => ({ code: d.code, naam: d.name }));
      await supabaseAdmin.from('twinfield_debiteuren').upsert(rows, { onConflict: 'code' });
    }
  } catch (e) {
    return NextResponse.json({ error: `Namen: ${String(e)}` }, { status: 502 });
  }

  // 2) Adressen aanvullen voor rijen zonder postcode, binnen tijdbudget.
  while (Date.now() - start < BUDGET_MS) {
    const { data: batch } = await supabaseAdmin
      .from('twinfield_debiteuren').select('code').is('postcode', null).limit(10);
    if (!batch?.length) break;
    let stop = false;
    for (const r of batch) {
      if (Date.now() - start > BUDGET_MS) { stop = true; break; }
      try {
        const d = await readDebiteur(r.code);
        await supabaseAdmin.from('twinfield_debiteuren').update({
          adres: d.adres || null, postcode: d.postcode || '', plaats: d.plaats || null,
          huisnummer: d.huisnummer || null, updated_at: new Date().toISOString(),
        }).eq('code', r.code);
        verrijkt++;
      } catch (e) {
        if (/429|rate limit/i.test(String(e))) { stop = true; break; } // volgende run gaat verder
        await supabaseAdmin.from('twinfield_debiteuren').update({ postcode: '' }).eq('code', r.code);
      }
      await sleep(DELAY_MS);
    }
    if (stop) break;
  }

  const { count: resterend } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code', { count: 'exact', head: true }).is('postcode', null);
  return NextResponse.json({ ok: true, verrijkt, resterend: resterend ?? 0 });
}
