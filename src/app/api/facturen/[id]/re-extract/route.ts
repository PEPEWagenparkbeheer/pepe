// Re-extract Groq + RDW op een bestaande factuur — handig voor oude rijen
// die zijn ingelezen voordat extractor/filter werden verbeterd.
// Overschrijft alleen velden die de parser teruggeeft; bewaart wat
// gebruiker handmatig heeft aangepast als parser leeg geeft.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseFactuurTekst } from '@/lib/factuur-parser';
import { rdwOpzoeken } from '@/lib/rdw';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: factuur, error } = await admin
    .from('facturen').select('*').eq('id', id).single();

  if (error || !factuur) {
    return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 });
  }

  // PDF tekst ophalen
  let pdfTekst = '';
  if (factuur.pdf_storage_path) {
    const { data: pdfBlob, error: dlErr } = await admin.storage
      .from('facturen').download(factuur.pdf_storage_path);
    if (dlErr || !pdfBlob) {
      return NextResponse.json({ error: 'PDF download faalde' }, { status: 500 });
    }
    try {
      const buffer = Buffer.from(await pdfBlob.arrayBuffer());
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      const text: unknown = result.text;
      pdfTekst = typeof text === 'string' ? text : Array.isArray(text) ? text.join('\n') : '';
    } catch (e) {
      console.error('re-extract pdf-parse fout:', e);
    }
  }

  const combined = [
    factuur.onderwerp ? `Onderwerp: ${factuur.onderwerp}` : '',
    pdfTekst,
  ].filter(Boolean).join('\n\n');

  const extract = combined.trim() ? await parseFactuurTekst(combined) : null;

  // RDW opnieuw
  let rdwData = factuur.rdw_data;
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
      console.error('re-extract rdw fout:', e);
    }
  }

  const update = {
    factuurnummer: extract?.factuurnummer ?? factuur.factuurnummer,
    factuurdatum: extract?.factuurdatum ?? factuur.factuurdatum,
    kenteken: extract?.kenteken ?? factuur.kenteken,
    bedrijfsnaam: extract?.bedrijfsnaam ?? factuur.bedrijfsnaam,
    kvk: extract?.kvk ?? null, // expliciet null als parser niets vindt (PEPE-filter)
    is_bedrijf: extract?.is_bedrijf ?? factuur.is_bedrijf,
    berijder_naam: extract?.berijder_naam ?? factuur.berijder_naam,
    berijder_email: extract?.berijder_email ?? factuur.berijder_email,
    bedrag_excl_btw: extract?.bedrag_excl_btw ?? factuur.bedrag_excl_btw,
    bedrag_incl_btw: extract?.bedrag_incl_btw ?? factuur.bedrag_incl_btw,
    straat: extract?.straat ?? factuur.straat,
    postcode: extract?.postcode ?? factuur.postcode,
    plaats: extract?.plaats ?? factuur.plaats,
    land: extract?.land ?? factuur.land,
    extracted_data: extract ?? factuur.extracted_data,
    rdw_data: rdwData,
  };

  const { error: upErr } = await admin.from('facturen').update(update).eq('id', id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, extract, rdwData });
}
