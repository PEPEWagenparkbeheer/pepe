// POST /api/brein/concept
// Genereert een concept-antwoord voor één bericht (body: { id }).
// Leest live een paar verzonden mails als stijlvoorbeeld (tone-of-voice, niet opgeslagen).
// Auth: ?secret=BREIN_SYNC_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { genereerConcept } from '@/lib/brein/concept';
import { PEPE_PROCEDURES } from '@/lib/brein/kennis';
import { buildBreinContext } from '@/lib/brein/context';
import { readAzureConfig, getAccessToken, getSentMessages } from '@/lib/graph';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** Zeer eenvoudige HTML→tekst, genoeg voor een mailtekst als prompt-input. */
function htmlNaarTekst(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  let id: string | undefined;
  try {
    ({ id } = (await req.json()) as { id?: string });
  } catch {
    return NextResponse.json({ error: 'Body moet { id } bevatten' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'id ontbreekt' }, { status: 400 });
  }

  // 1. Bericht ophalen
  const { data: bericht, error: fetchError } = await supabaseAdmin
    .from('brein_messages')
    .select('id, mailbox, onderwerp, afzender_naam, afzender_email, categorie, body_html, body_preview, hubspot_deal_id, hubspot_company_id, kenteken')
    .eq('id', id)
    .single();

  if (fetchError || !bericht) {
    return NextResponse.json({ error: fetchError?.message ?? 'Bericht niet gevonden' }, { status: 404 });
  }

  // 2. Stijlvoorbeelden live ophalen (faalt zachtjes — concept kan ook zonder)
  let stijlvoorbeelden: { subject: string; bodyPreview: string }[] = [];
  try {
    const { accessToken } = await getAccessToken(readAzureConfig());
    stijlvoorbeelden = await getSentMessages(accessToken, bericht.mailbox, 8);
  } catch (err) {
    console.warn('[brein/concept] Verzonden items ophalen mislukt:', err instanceof Error ? err.message : err);
  }

  // 3. Feiten-context: berijder → RIJDEND voertuig (leasemaatschappij/contract) + RDW.
  const contextDelen = await buildBreinContext({
    afzenderEmail: bericht.afzender_email,
    kenteken: bericht.kenteken,
  });

  const body = bericht.body_html
    ? htmlNaarTekst(bericht.body_html)
    : (bericht.body_preview ?? '');

  // 5. Concept genereren
  let concept: string;
  try {
    concept = await genereerConcept({
      onderwerp: bericht.onderwerp,
      afzenderNaam: bericht.afzender_naam,
      afzenderEmail: bericht.afzender_email,
      categorie: bericht.categorie,
      body,
      stijlvoorbeelden,
      context: contextDelen.join('\n') || undefined,
      procedures: PEPE_PROCEDURES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brein/concept] Generatie mislukt:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 6. Opslaan
  const { error: updateError } = await supabaseAdmin
    .from('brein_messages')
    .update({ concept_antwoord: concept })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, concept });
}
