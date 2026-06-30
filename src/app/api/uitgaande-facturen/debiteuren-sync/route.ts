// POST /api/uitgaande-facturen/debiteuren-sync
// Bouwt/ververst de lokale Twinfield-debiteuren-index. Twinfield heeft een rate limit, dus:
//  - ?phase=names : haalt de volledige lijst (1 call) en upsert namen.
//  - default      : verrijkt een KLEINE batch met adressen, mét pauzes tussen calls.
// Bij een 429 stopt de batch en geven we { rateLimited, retryAfter } terug; de client wacht dan.
// Client roept herhaald aan tot resterend 0 is.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { listAlleDebiteuren, readDebiteur } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 10;
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retrySeconden(e: unknown): number | null {
  const s = String(e);
  if (!/429|rate limit/i.test(s)) return null;
  return Number(s.match(/(\d+)\s*second/i)?.[1] ?? 40);
}

// Zet een Twinfield-fout om in een korte, leesbare melding (geen ruwe HTML-foutpagina in een alert).
function schoonTwinfieldFout(e: unknown): string {
  const s = String(e);
  if (/502|bad gateway/i.test(s)) return 'Twinfield is momenteel niet bereikbaar (502 Bad Gateway). Dit ligt aan Twinfield zelf — probeer het over een paar minuten opnieuw.';
  if (/503|service unavailable/i.test(s)) return 'Twinfield is tijdelijk niet beschikbaar (503). Probeer het later opnieuw.';
  if (/504|gateway timeout/i.test(s)) return 'Twinfield reageerde niet op tijd (504). Probeer het later opnieuw.';
  if (/<html|<!doctype/i.test(s)) return 'Twinfield gaf een onverwachte respons (waarschijnlijk tijdelijk niet bereikbaar). Probeer het later opnieuw.';
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

async function aantalZonderAdres(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code', { count: 'exact', head: true }).is('postcode', null);
  return count ?? 0;
}

export async function POST(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const phase = new URL(req.url).searchParams.get('phase');

  // Fase 1: namen (1 Twinfield-call).
  if (phase === 'names') {
    try {
      const lijst = await listAlleDebiteuren();
      for (let i = 0; i < lijst.length; i += 500) {
        const rows = lijst.slice(i, i + 500).map((d) => ({ code: d.code, naam: d.name }));
        const { error } = await supabaseAdmin.from('twinfield_debiteuren').upsert(rows, { onConflict: 'code' });
        if (error) return NextResponse.json({ error: `Namen opslaan: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ fase: 'names', totaal: lijst.length, resterend: await aantalZonderAdres() });
    } catch (e) {
      const wacht = retrySeconden(e);
      if (wacht) return NextResponse.json({ fase: 'names', rateLimited: true, retryAfter: wacht, resterend: await aantalZonderAdres() });
      return NextResponse.json({ error: schoonTwinfieldFout(e) }, { status: 502 });
    }
  }

  // Fase 2: adressen verrijken (kleine batch, met pauzes).
  const { data: teVerrijken } = await supabaseAdmin
    .from('twinfield_debiteuren').select('code').is('postcode', null).limit(BATCH);

  let verrijkt = 0;
  let rateLimited = false;
  let retryAfter = 0;
  for (const r of teVerrijken ?? []) {
    try {
      const d = await readDebiteur(r.code);
      await supabaseAdmin.from('twinfield_debiteuren').update({
        adres: d.adres || null,
        postcode: d.postcode || '',   // '' = verwerkt (voorkomt eindeloos opnieuw proberen)
        plaats: d.plaats || null,
        huisnummer: d.huisnummer || null,
        updated_at: new Date().toISOString(),
      }).eq('code', r.code);
      verrijkt++;
    } catch (e) {
      const wacht = retrySeconden(e);
      if (wacht) { rateLimited = true; retryAfter = wacht; break; }       // 429 → stoppen, client wacht
      await supabaseAdmin.from('twinfield_debiteuren').update({ postcode: '' }).eq('code', r.code); // andere fout → overslaan
    }
    await sleep(DELAY_MS);
  }

  return NextResponse.json({ verrijkt, rateLimited, retryAfter, resterend: await aantalZonderAdres() });
}
