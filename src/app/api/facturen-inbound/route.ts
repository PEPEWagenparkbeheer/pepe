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
import { extractText, getDocumentProxy } from 'unpdf';
import { parseFactuurTekst } from '@/lib/factuur-parser';
import { rdwOpzoeken } from '@/lib/rdw';

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
  if (req.nextUrl.searchParams.get('secret') !== process.env.FACTUREN_WEBHOOK_SECRET) {
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

  // Combineer PDF-tekst met mail-body voor Groq
  const combinedTekst = [
    body.Subject ? `Onderwerp: ${body.Subject}` : '',
    pdfTekst,
    body.TextBody || body.StrippedTextReply || '',
  ].filter(Boolean).join('\n\n');

  const extract = combinedTekst.trim()
    ? await parseFactuurTekst(combinedTekst)
    : null;

  // RDW-verrijking bij gevonden kenteken
  let rdwData: unknown = null;
  let apkDatum: string | null = null;
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
        if (rdw.apkDatum) {
          // RDW geeft "dd-mm-yyyy" → ISO yyyy-mm-dd voor DB
          const [d, m, y] = rdw.apkDatum.split('-');
          apkDatum = `${y}-${m}-${d}`;
        }
      }
    } catch (e) {
      console.error('facturen-inbound rdw fout:', e);
    }
  }

  const rawEmail = [
    `Van: ${body.From ?? ''}`,
    `Onderwerp: ${body.Subject ?? ''}`,
    `Datum: ${body.Date ?? ''}`,
    '',
    body.TextBody || body.StrippedTextReply || body.HtmlBody || '',
  ].join('\n');

  const insertPayload = {
    ontvangen_op: body.Date ?? new Date().toISOString(),
    postmark_message_id: body.MessageID ?? null,
    afzender: body.From ?? null,
    onderwerp: body.Subject ?? null,
    raw_email: rawEmail,
    pdf_storage_path: pdfStoragePath,
    pdf_bestandsnaam: pdfBestandsnaam,
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
    // Als RDW een APK heeft maar Groq geen factuurdatum, vullen we het
    // factuur-record niet met APK; we slaan de APK alleen op in rdw_data
    // zodat de modal het kan tonen. (apkDatum hieronder enkel als veld
    // beschikbaar — niet als kolom; logging only.)
    status: 'nieuw',
    gearchiveerd: false,
  };
  void apkDatum;

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
