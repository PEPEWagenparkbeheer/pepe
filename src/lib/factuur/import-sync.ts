// Data-sync van een after_sales import-record naar de gekoppelde (pijplijn-)factuur.
// De import-auto verzamelt tijdens het ~6-weken-traject kenteken (bij BIN), chassis en
// definitieve rest-BPM (uit het Belastingdienst-betaalbericht). Zodra een after_sales-rij
// aan een factuur gekoppeld is, stroomt die data hierheen. Bij rijklaar (`klaar=true`)
// materialiseert de factuur: van 'pijplijn' naar de werklijst.
//
// Server-only (service-role). Nooit een geboekte/verzonden factuur muteren.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel, BtwCode } from '@/types/factuur';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Statussen die de sync mag aanraken. Een 'definitief'/'verzonden'/'geannuleerd' factuur
// is geboekt/verstuurd en wordt nooit meer automatisch gewijzigd.
const MUTEERBAAR = ['pijplijn', 'concept', 'ter_controle'];

type Voertuig = Record<string, unknown> & {
  merk?: string | null; model?: string | null;
  btw_soort?: 'btw' | 'marge' | null;
  toe_te_betalen?: number | null;
  rest_bpm?: number | null;
  kenteken?: string | null;
  chassis?: string | null;
};

/** Herbouwt de auto-regels uit het voertuig — identiek aan `derivedRegels` in FactuurModal. */
function bouwAutoRegels(v: Voertuig, btwNummer: string | null | undefined): FactuurRegel[] {
  const ttb = Number(v.toe_te_betalen) || 0;
  const bpm = Number(v.rest_bpm) || 0;
  const naam = `Levering ${v.merk ?? ''} ${v.model ?? ''}`.trim() || 'Levering voertuig';
  const intra = (btwNummer ?? '').trim() !== '' && !(btwNummer ?? '').trim().toUpperCase().startsWith('NL');

  if ((v.btw_soort ?? 'btw') === 'marge') {
    return [{ omschrijving: naam, aantal: 1, prijs_excl: round2(ttb), btw_code: 'marge' as BtwCode }];
  }
  if (intra) {
    const arr: FactuurRegel[] = [{ omschrijving: naam, aantal: 1, prijs_excl: round2(Math.max(ttb - bpm, 0)), btw_code: 'geen' }];
    if (bpm > 0) arr.push({ omschrijving: 'BPM', aantal: 1, prijs_excl: round2(bpm), btw_code: 'geen' });
    return arr;
  }
  const netto = ttb > 0 ? round2((ttb - bpm) / 1.21) : 0;
  const arr: FactuurRegel[] = [{ omschrijving: naam, aantal: 1, prijs_excl: netto, btw_code: 'hoog' }];
  if (bpm > 0) arr.push({ omschrijving: 'BPM', aantal: 1, prijs_excl: round2(bpm), btw_code: 'geen' });
  return arr;
}

const isAutoRegel = (r: FactuurRegel) =>
  (r.omschrijving ?? '').startsWith('Levering') || r.omschrijving === 'BPM';

export interface SyncResult {
  ok: boolean;
  updated?: boolean;
  reason?: string;
  factuurId?: string;
  nieuweStatus?: string;
}

/**
 * Synct de gekoppelde factuur met de actuele after_sales-data. No-op als er geen (muteerbare)
 * factuur aan de auto hangt. Idempotent — mag meermaals draaien (bv. elke TransConnect-sync).
 */
export async function syncAfterSalesNaarFactuur(afterSalesId: string): Promise<SyncResult> {
  const { data: as, error: asErr } = await supabaseAdmin
    .from('after_sales')
    .select('id, type, kenteken, bin_ontvangen, chassis, rest_bpm, klaar')
    .eq('id', afterSalesId)
    .maybeSingle();
  if (asErr) return { ok: false, reason: asErr.message };
  if (!as) return { ok: true, updated: false, reason: 'after_sales niet gevonden' };

  const { data: factuur, error: fErr } = await supabaseAdmin
    .from('uitgaande_facturen')
    .select('id, status, voertuig, regels, btw_nummer')
    .eq('after_sales_id', afterSalesId)
    .maybeSingle();
  if (fErr) return { ok: false, reason: fErr.message };
  if (!factuur) return { ok: true, updated: false, reason: 'geen gekoppelde factuur' };
  if (!MUTEERBAAR.includes(factuur.status)) {
    return { ok: true, updated: false, reason: `status ${factuur.status} niet muteerbaar`, factuurId: factuur.id };
  }

  const huidig = (factuur.voertuig ?? {}) as Voertuig;
  const nieuw: Voertuig = { ...huidig };

  // Kenteken alleen overnemen als het het écht NL-kenteken is (bin_ontvangen); vóór BIN bevat
  // after_sales.kenteken de meldcode — die hoort niet op de factuur.
  if (as.bin_ontvangen && as.kenteken && as.kenteken.trim()) nieuw.kenteken = as.kenteken.trim();
  if (as.chassis && as.chassis.trim()) nieuw.chassis = as.chassis.trim();
  if (as.rest_bpm != null) nieuw.rest_bpm = as.rest_bpm;

  // Regels + totalen herrekenen (auto-regels uit voertuig, handmatige regels behouden).
  const handmatig = ((factuur.regels ?? []) as FactuurRegel[]).filter((r) => !isAutoRegel(r));
  const alleRegels = [...bouwAutoRegels(nieuw, factuur.btw_nummer), ...handmatig];
  const totalen = berekenTotalen(alleRegels);

  // Rijklaar-transitie: pijplijn -> werklijst. Compleet (kenteken + rest_bpm/marge) => direct
  // ter_controle, anders concept (nog handmatige controle nodig).
  let nieuweStatus = factuur.status;
  if (as.klaar === true && factuur.status === 'pijplijn') {
    const compleet = !!nieuw.kenteken && ((nieuw.btw_soort ?? 'btw') === 'marge' || nieuw.rest_bpm != null);
    nieuweStatus = compleet ? 'ter_controle' : 'concept';
  }

  const { error: updErr } = await supabaseAdmin
    .from('uitgaande_facturen')
    .update({
      voertuig: nieuw,
      regels: alleRegels,
      totaal_excl: totalen.totaal_excl,
      totaal_btw: totalen.totaal_btw,
      totaal_incl: totalen.totaal_incl,
      status: nieuweStatus,
    })
    .eq('id', factuur.id);
  if (updErr) return { ok: false, reason: updErr.message, factuurId: factuur.id };

  return { ok: true, updated: true, factuurId: factuur.id, nieuweStatus };
}
