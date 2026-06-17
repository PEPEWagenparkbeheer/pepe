// POST /api/brein/classify
// Classificeert alle onverwerkte BREIN-berichten (categorie IS NULL) met Claude Haiku.
// Doet ook HubSpot-lookup op afzender_email en kenteken.
// Auth: ?secret=BREIN_SYNC_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyBericht } from '@/lib/brein/classifier';
import { searchContactByEmail, searchDealByKenteken } from '@/lib/hubspot';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const MAX_PER_RUN = 20; // Haiku is snel, maar limieten voorkomen timeouts

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  // Haal onverwerkte berichten op (categorie IS NULL)
  const { data: berichten, error: fetchError } = await supabaseAdmin
    .from('brein_messages')
    .select('id, onderwerp, afzender_naam, afzender_email, body_preview, kenteken')
    .is('categorie', null)
    .order('ontvangen_op', { ascending: true })
    .limit(MAX_PER_RUN);

  if (fetchError) {
    console.error('[brein/classify] Fetch fout:', fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!berichten || berichten.length === 0) {
    return NextResponse.json({ classified: 0, skipped: 0 });
  }

  let classified = 0;
  let errors = 0;

  for (const bericht of berichten) {
    try {
      // 1. Classificeer met Claude Haiku
      const result = await classifyBericht({
        onderwerp: bericht.onderwerp,
        afzender_naam: bericht.afzender_naam,
        afzender_email: bericht.afzender_email,
        body_preview: bericht.body_preview,
      });

      // 2. HubSpot-lookup (gebruik bestaand kenteken als override)
      const kentekenFinal = bericht.kenteken ?? result.kenteken;

      const [hubspotContactId, hubspotDealId] = await Promise.allSettled([
        bericht.afzender_email ? searchContactByEmail(bericht.afzender_email) : Promise.resolve(null),
        kentekenFinal ? searchDealByKenteken(kentekenFinal) : Promise.resolve(null),
      ]);

      // 3. Update brein_messages
      const update: Record<string, unknown> = {
        categorie: result.categorie,
        prioriteit: result.prioriteit,
        samenvatting: result.samenvatting,
        verwerkt_op: new Date().toISOString(),
      };

      if (kentekenFinal) update.kenteken = kentekenFinal;

      if (hubspotContactId.status === 'fulfilled' && hubspotContactId.value) {
        update.hubspot_company_id = hubspotContactId.value;
      }
      if (hubspotDealId.status === 'fulfilled' && hubspotDealId.value) {
        update.hubspot_deal_id = hubspotDealId.value;
      }

      const { error: updateError } = await supabaseAdmin
        .from('brein_messages')
        .update(update)
        .eq('id', bericht.id);

      if (updateError) {
        console.error(`[brein/classify] Update fout voor ${bericht.id}:`, updateError);
        errors++;
      } else {
        classified++;
        console.log(`[brein/classify] ${bericht.id}: ${result.categorie} / ${result.prioriteit}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[brein/classify] Fout bij ${bericht.id}:`, msg);
      errors++;
    }
  }

  return NextResponse.json({
    classified,
    errors,
    total_onverwerkt: berichten.length,
  });
}