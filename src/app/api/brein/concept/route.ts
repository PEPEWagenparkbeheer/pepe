// POST /api/brein/concept
// Genereert een concept-antwoord voor één bericht (body: { id }).
// Leest live een paar verzonden mails als stijlvoorbeeld (tone-of-voice, niet opgeslagen).
// Auth: ?secret=BREIN_SYNC_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { genereerConcept } from '@/lib/brein/concept';
import { PEPE_PROCEDURES } from '@/lib/brein/kennis';
import { getDealFields, getContactFields, searchContactByEmail, searchDealByKenteken } from '@/lib/hubspot';
import { readAzureConfig, getAccessToken, getSentMessages } from '@/lib/graph';
import { rdwOpzoeken } from '@/lib/rdw';

export const runtime = 'nodejs';

const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

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
  const secret = req.nextUrl.searchParams.get('secret');
  if (!BREIN_SYNC_SECRET || secret !== BREIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // 3. Context uit HubSpot (zodat BREIN de juiste leasemaatschappij-URLs e.d. kiest).
  //    Pincode bewust NIET meegegeven aan de LLM (privacy) — markeer met placeholder.
  const contextDelen: string[] = [];
  if (bericht.kenteken) contextDelen.push(`Kenteken: ${bericht.kenteken}`);

  // Zoek contact/deal zelf op (niet afhankelijk van of classify al draaide).
  let contactId = bericht.hubspot_company_id as string | null;
  let dealId = bericht.hubspot_deal_id as string | null;
  if (!contactId && bericht.afzender_email) {
    contactId = await searchContactByEmail(bericht.afzender_email).catch(() => null);
  }
  if (!dealId && bericht.kenteken) {
    dealId = await searchDealByKenteken(bericht.kenteken).catch(() => null);
  }

  if (dealId) {
    try {
      const f = await getDealFields(dealId, [
        'leasemaatschappij_goed', 'type_aanschaf', 'brandstof',
        'fiscale_waarde', 'apk_datum', 'winterbanden_in_contract', 'verwachte_einddatum',
      ]);
      if (f.leasemaatschappij_goed) contextDelen.push(`Leasemaatschappij van de berijder: ${f.leasemaatschappij_goed}`);
      if (f.type_aanschaf) contextDelen.push(`Contracttype: ${f.type_aanschaf}`);
      if (f.brandstof) contextDelen.push(`Brandstof: ${f.brandstof}`);
      if (f.fiscale_waarde) contextDelen.push(`Fiscale waarde: ${f.fiscale_waarde}`);
      if (f.apk_datum) contextDelen.push(`APK-datum: ${f.apk_datum}`);
      if (f.winterbanden_in_contract) contextDelen.push(`Bandenprofiel: ${f.winterbanden_in_contract}`);
      if (f.verwachte_einddatum) contextDelen.push(`Einddatum contract: ${f.verwachte_einddatum}`);
    } catch (err) {
      console.warn('[brein/concept] HubSpot deal-velden ophalen mislukt:', err instanceof Error ? err.message : err);
    }
  }

  if (contactId) {
    try {
      const c = await getContactFields(contactId, ['city', 'zip']);
      if (c.city) contextDelen.push(`Woonplaats berijder: ${c.city}${c.zip ? ' (' + c.zip + ')' : ''}`);
    } catch (err) {
      console.warn('[brein/concept] HubSpot contact-velden ophalen mislukt:', err instanceof Error ? err.message : err);
    }
  }

  // 4. RDW-fallback: APK-datum, catalogusprijs en brandstof ophalen als HubSpot die niet heeft.
  if (bericht.kenteken) {
    const heeftApk = contextDelen.some(d => d.startsWith('APK-datum'));
    const heeftFiscaal = contextDelen.some(d => d.startsWith('Fiscale waarde'));
    const heeftBrandstof = contextDelen.some(d => d.startsWith('Brandstof'));
    if (!heeftApk || !heeftFiscaal || !heeftBrandstof) {
      try {
        const rdw = await rdwOpzoeken(bericht.kenteken);
        if (rdw) {
          if (!heeftApk && rdw.apkDatum) contextDelen.push(`APK-datum (RDW): ${rdw.apkDatum}`);
          if (!heeftFiscaal && rdw.catalogusprijs) {
            contextDelen.push(`Catalogusprijs/fiscale waarde (RDW): €${rdw.catalogusprijs.toLocaleString('nl-NL')}`);
          }
          if (!heeftBrandstof && rdw.brandstof) contextDelen.push(`Brandstof (RDW): ${rdw.brandstof}`);
        }
      } catch (err) {
        console.warn('[brein/concept] RDW-lookup mislukt:', err instanceof Error ? err.message : err);
      }
    }
  }

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
