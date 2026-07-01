// Verwerkt Belastingdienst BPM-betaalberichten uit de info@-inbox: extraheert chassis + rest-BPM,
// matcht op de import-auto (chassis = sleutel, net als de TransConnect-webhook), vult rest-BPM in,
// vinkt "BPM goedgekeurd/ingediend" automatisch af, en laat de gekoppelde pijplijn-factuur meebewegen.
// Idempotent op after_sales.rest_bpm_bron_ref = 'bpmbericht:<message-id>'.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseBpmBericht } from '@/lib/factuur/bpmbericht-parse';
import { syncAfterSalesNaarFactuur } from '@/lib/factuur/import-sync';
import type { GraphMessage } from '@/lib/graph/mail';

export interface BpmImportResult {
  ok: boolean;
  afterSalesId?: string;
  bestond?: boolean;
  genegeerd?: boolean;
  chassis?: string | null;
  rest_bpm?: number | null;
  error?: string;
}

const isBpmBericht = (subject: string) =>
  /bpm/i.test(subject) && /(betaalbericht|betaal|rest)/i.test(subject);

/** Verwerkt één BPM-betaalbericht (idempotent op rest_bpm_bron_ref). */
export async function importeerBpmBericht(msg: GraphMessage): Promise<BpmImportResult> {
  const ref = `bpmbericht:${msg.id}`;

  // Idempotent: dit bericht al verwerkt?
  const { data: bestaat } = await supabaseAdmin
    .from('after_sales').select('id').eq('rest_bpm_bron_ref', ref).maybeSingle();
  if (bestaat) return { ok: true, afterSalesId: bestaat.id, bestond: true };

  // Veiligheidsfilter op onderwerp.
  if (!isBpmBericht(msg.subject)) return { ok: true, genegeerd: true, error: 'Geen BPM-betaalbericht.' };

  const d = await parseBpmBericht(msg.bodyHtml || msg.bodyPreview, !!msg.bodyHtml);
  if (!d?.chassis) return { ok: true, genegeerd: true, error: 'Geen chassisnummer in bericht.' };
  const chassis = d.chassis;

  // Match op de import-auto. Eerst op het volledige chassis (indien al bekend), anders op de
  // meldcode (laatste 4 = kenteken_clean) — exact zoals de TransConnect-webhook matcht.
  const kies = (rows: { id: string; chassis: string | null }[] | null) => rows?.[0] ?? null;
  let auto = kies((await supabaseAdmin
    .from('after_sales').select('id, chassis')
    .eq('type', 'import').eq('gearchiveerd', false).eq('chassis', chassis)
    .order('created_at', { ascending: false }).limit(1)).data);
  if (!auto) {
    auto = kies((await supabaseAdmin
      .from('after_sales').select('id, chassis')
      .eq('type', 'import').eq('gearchiveerd', false).eq('kenteken_clean', chassis.slice(-4).toUpperCase())
      .order('created_at', { ascending: false }).limit(1)).data);
  }
  // Geen match: auto is er mogelijk nog niet. Niet markeren (geen bron_ref) → volgende cron probeert opnieuw.
  if (!auto) return { ok: true, genegeerd: true, chassis, error: `Geen import-auto voor chassis ${chassis}.` };

  const patch: Record<string, unknown> = {
    rest_bpm: d.rest_bpm ?? null,
    rest_bpm_bron_ref: ref,
    bpm_goedgekeurd: true,   // het betaalbericht ís de goedkeuring
    bpm_ingediend: true,     // kan niet goedgekeurd zijn zonder ingediend
  };
  if (!auto.chassis) patch.chassis = chassis; // volledig VIN vastleggen voor toekomstige matches

  const { error } = await supabaseAdmin.from('after_sales').update(patch).eq('id', auto.id);
  if (error) return { ok: false, error: error.message };

  // Laat de gekoppelde pijplijn-factuur meebewegen (rest-BPM op de factuur, regels herrekend).
  try { await syncAfterSalesNaarFactuur(auto.id); } catch { /* niet fataal */ }

  return { ok: true, afterSalesId: auto.id, chassis, rest_bpm: d.rest_bpm ?? null };
}

/** Haalt de info@-inbox op, filtert BPM-betaalberichten en verwerkt ze (idempotent). */
export async function verwerkBpmInbox(token: string, mailbox: string, top = 200, maxNieuw = 10): Promise<{
  gescand: number; nieuw: number; bestond: number; genegeerd: number; fouten: number; resterend: number;
  resultaten: BpmImportResult[];
}> {
  const { listMessageHeaders, getMessage } = await import('@/lib/graph/mail');
  const headers = await listMessageHeaders(token, mailbox, top);
  const kandidaten = headers.filter((m) => isBpmBericht(m.subject));

  // Welke kandidaten zijn al verwerkt? (1 query)
  const refs = kandidaten.map((c) => `bpmbericht:${c.id}`);
  const bestaand = new Set<string>();
  if (refs.length) {
    const { data } = await supabaseAdmin.from('after_sales').select('rest_bpm_bron_ref').in('rest_bpm_bron_ref', refs);
    for (const r of data ?? []) if (r.rest_bpm_bron_ref) bestaand.add(r.rest_bpm_bron_ref);
  }

  const resultaten: BpmImportResult[] = [];
  let nieuw = 0, bestond = bestaand.size, genegeerd = 0, fouten = 0, resterend = 0;
  for (const c of kandidaten) {
    if (bestaand.has(`bpmbericht:${c.id}`)) continue;
    if (nieuw >= maxNieuw) { resterend++; continue; }
    try {
      const full = await getMessage(token, mailbox, c.id);
      const r = await importeerBpmBericht(full);
      resultaten.push(r);
      if (!r.ok) fouten++;
      else if (r.bestond) bestond++;
      else if (r.genegeerd) genegeerd++;
      else nieuw++;
    } catch (e) {
      fouten++; resultaten.push({ ok: false, error: String(e) });
    }
  }
  return { gescand: kandidaten.length, nieuw, bestond, genegeerd, fouten, resterend, resultaten };
}
