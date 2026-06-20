// Postmark inbound webhook voor verkoopfacturen.
// Stream-config in Postmark: POST naar /api/facturen-inbound?secret=...
// Voor elke binnenkomende mail:
//  1. PDF-attachment opslaan in Supabase Storage bucket 'facturen'
//  2. PDF-tekst extraheren via unpdf
//  3. Velden extraheren via Groq (zie factuur-parser.ts)
//  4. Indien kenteken gevonden: RDW-verrijking
//  5. Insert in tabel facturen met status 'nieuw'

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { webhookSecretOk } from '@/lib/apiAuth';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseFactuurTekst } from '@/lib/factuur-parser';
import { rdwOpzoeken } from '@/lib/rdw';
import { classifyDocument } from '@/lib/documentenstroom/classifyDocument';
import { extraheertInzetdocument } from '@/lib/brein/inzetdocument';
import { extraheertAutokosten } from '@/lib/documentenstroom/autokosten';
import { htmlNaarTekst } from '@/lib/htmlNaarTekst';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PostmarkAttachment {
  Name: string;
  Content: string;        // base64
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInbound {
  MessageID?: string;
  From?: string;
  FromName?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Date?: string;
  Attachments?: PostmarkAttachment[];
}

export async function POST(req: NextRequest) {
  if (!webhookSecretOk(req, process.env.FACTUREN_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PostmarkInbound;
  try {
    body = (await req.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // PDF-attachment vinden
  const pdfAttachment = (body.Attachments ?? []).find(
    (a) => a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf'),
  );

  let pdfStoragePath: string | null = null;
  let pdfBestandsnaam: string | null = null;
  let pdfTekst = '';

  if (pdfAttachment) {
    const buffer = Buffer.from(pdfAttachment.Content, 'base64');
    pdfBestandsnaam = pdfAttachment.Name;
    pdfStoragePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${pdfAttachment.Name}`;

    const { error: uploadErr } = await admin.storage
      .from('facturen')
      .upload(pdfStoragePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadErr) {
      console.error('facturen-inbound storage fout:', uploadErr.message);
      pdfStoragePath = null;
    }

    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      const text: unknown = result.text;
      pdfTekst = typeof text === 'string' ? text : Array.isArray(text) ? text.join('\n') : '';
    } catch (e) {
      console.error('facturen-inbound pdf-parse fout:', e);
    }
  }

  // Haal de best beschikbare mailtekst op (TextBody > HtmlBody tabel-bewust gestript > leeg)
  const mailBodyTekst =
    body.TextBody ||
    body.StrippedTextReply ||
    (body.HtmlBody ? htmlNaarTekst(body.HtmlBody) : '');

  // Combineer PDF-tekst met mail-body voor classificatie + extractie
  // Body-only emails: mailBodyTekst is de primaire bron (pdfTekst is leeg)
  const combinedTekst = [
    body.Subject ? `Onderwerp: ${body.Subject}` : '',
    pdfTekst,
    mailBodyTekst,
  ].filter(Boolean).join('\n\n');

  const classificatie = await classifyDocument(body.Subject ?? '', combinedTekst);

  const rawEmail = [
    `Van: ${body.From ?? ''}`,
    `Onderwerp: ${body.Subject ?? ''}`,
    `Datum: ${body.Date ?? ''}`,
    '',
    body.TextBody || body.StrippedTextReply || body.HtmlBody || '',
  ].join('\n');

  const basePayload = {
    ontvangen_op: body.Date ?? new Date().toISOString(),
    postmark_message_id: body.MessageID ?? null,
    afzender: body.From ?? null,
    onderwerp: body.Subject ?? null,
    raw_email: rawEmail,
    pdf_storage_path: pdfStoragePath,
    pdf_bestandsnaam: pdfBestandsnaam,
    documenttype: classificatie.documenttype,
    status: 'nieuw',
    gearchiveerd: false,
  };

  let insertPayload: Record<string, unknown>;

  if (
    classificatie.documenttype === 'bestelbevestiging' ||
    classificatie.documenttype === 'inzetbevestiging'
  ) {
    // Bestel- en inzetbevestigingen: extraheer via inzetdocument-extractor
    const inzetExtract = combinedTekst.trim()
      ? await extraheertInzetdocument(body.Subject ?? '', combinedTekst)
      : null;

    // RDW alleen bij inzetbevestiging (heeft kenteken)
    let rdwData: unknown = null;
    if (inzetExtract?.kenteken) {
      try {
        const rdw = await rdwOpzoeken(inzetExtract.kenteken);
        if (rdw) {
          rdwData = {
            merk: rdw.voertuig.merk,
            handelsbenaming: rdw.voertuig.handelsbenaming,
            brandstof: rdw.brandstof,
            catalogusprijs: rdw.catalogusprijs,
            apkDatum: rdw.apkDatum,
            recalls: rdw.recalls.length,
          };
        }
      } catch (e) {
        console.error('facturen-inbound rdw fout:', e);
      }
    }

    const berijderNaam = [inzetExtract?.berijder_voornaam, inzetExtract?.berijder_achternaam]
      .filter(Boolean).join(' ') || null;

    insertPayload = {
      ...basePayload,
      contractnummer: inzetExtract?.contractnummer ?? null,
      merk_model: inzetExtract?.merk_model ?? null,
      brandstof: inzetExtract?.brandstof ?? null,
      looptijd_maanden: inzetExtract?.looptijd_maanden ?? null,
      jaarkilometrage: inzetExtract?.jaarkilometrage ?? null,
      type_aanschaf: inzetExtract?.type_aanschaf ?? null,
      banden: inzetExtract?.banden ?? null,
      inzetdatum: inzetExtract?.inzetdatum ?? null,
      leasemaatschappij: inzetExtract?.leasemaatschappij_naam ?? null,
      kenteken: inzetExtract?.kenteken ?? null,
      berijder_naam: berijderNaam,
      berijder_email: inzetExtract?.berijder_email ?? null,
      bedrijfsnaam: inzetExtract?.bedrijf_naam ?? null,
      kvk: inzetExtract?.bedrijf_kvk ?? null,
      straat: inzetExtract?.bedrijf_adres ?? null,
      postcode: inzetExtract?.bedrijf_postcode ?? null,
      plaats: inzetExtract?.bedrijf_stad ?? null,
      extracted_data: inzetExtract ?? null,
      rdw_data: rdwData,
    };
  } else if (classificatie.documenttype === 'autokosten') {
    // Werkplaatsfacturen: extraheer regels voor kosten-analyse
    const autokostenExtract = combinedTekst.trim()
      ? await extraheertAutokosten(body.Subject ?? '', combinedTekst)
      : null;

    let rdwData: unknown = null;
    if (autokostenExtract?.kenteken) {
      try {
        const rdw = await rdwOpzoeken(autokostenExtract.kenteken);
        if (rdw) {
          rdwData = {
            merk: rdw.voertuig.merk,
            handelsbenaming: rdw.voertuig.handelsbenaming,
            brandstof: rdw.brandstof,
            catalogusprijs: rdw.catalogusprijs,
            apkDatum: rdw.apkDatum,
            recalls: rdw.recalls.length,
          };
        }
      } catch (e) {
        console.error('facturen-inbound rdw fout:', e);
      }
    }

    insertPayload = {
      ...basePayload,
      kenteken: autokostenExtract?.kenteken ?? null,
      bedrijfsnaam: autokostenExtract?.garage_naam ?? null,
      factuurnummer: autokostenExtract?.factuurnummer ?? null,
      factuurdatum: autokostenExtract?.factuurdatum ?? null,
      bedrag_excl_btw: autokostenExtract?.bedrag_excl_btw ?? null,
      bedrag_incl_btw: autokostenExtract?.bedrag_incl_btw ?? null,
      extracted_data: autokostenExtract ?? null,
      rdw_data: rdwData,
    };
  } else {
    // Reguliere facturen: gebruik bestaande factuur-parser
    const extract = combinedTekst.trim()
      ? await parseFactuurTekst(combinedTekst)
      : null;

    let rdwData: unknown = null;
    if (extract?.kenteken) {
      try {
        const rdw = await rdwOpzoeken(extract.kenteken);
        if (rdw) {
          rdwData = {
            merk: rdw.voertuig.merk,
            handelsbenaming: rdw.voertuig.handelsbenaming,
            brandstof: rdw.brandstof,
            catalogusprijs: rdw.catalogusprijs,
            apkDatum: rdw.apkDatum,
            recalls: rdw.recalls.length,
          };
        }
      } catch (e) {
        console.error('facturen-inbound rdw fout:', e);
      }
    }

    insertPayload = {
      ...basePayload,
      factuurnummer: extract?.factuurnummer ?? null,
      factuurdatum: extract?.factuurdatum ?? null,
      kenteken: extract?.kenteken ?? null,
      bedrijfsnaam: extract?.bedrijfsnaam ?? null,
      kvk: extract?.kvk ?? null,
      is_bedrijf: extract?.is_bedrijf ?? true,
      berijder_naam: extract?.berijder_naam ?? null,
      berijder_email: extract?.berijder_email ?? null,
      bedrag_excl_btw: extract?.bedrag_excl_btw ?? null,
      bedrag_incl_btw: extract?.bedrag_incl_btw ?? null,
      straat: extract?.straat ?? null,
      postcode: extract?.postcode ?? null,
      plaats: extract?.plaats ?? null,
      land: extract?.land ?? null,
      extracted_data: extract ?? null,
      rdw_data: rdwData,
    };
  }

  const { data, error } = await admin
    .from('facturen')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('facturen-inbound insert fout:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, factuur_id: data.id });
}
