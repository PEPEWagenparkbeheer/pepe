// Re-extract per documenttype op een bestaande factuur.
// Kiest automatisch de juiste extractor op basis van het opgeslagen documenttype.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseFactuurTekst } from '@/lib/factuur-parser';
import { extraheertInzetdocument } from '@/lib/brein/inzetdocument';
import { extraheertAutokosten } from '@/lib/documentenstroom/autokosten';
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
    if (!dlErr && pdfBlob) {
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
  }

  const combined = [
    factuur.onderwerp ? `Onderwerp: ${factuur.onderwerp}` : '',
    pdfTekst,
  ].filter(Boolean).join('\n\n');

  const dt: string = factuur.documenttype ?? 'factuur';
  let update: Record<string, unknown> = {};

  if (dt === 'bestelbevestiging' || dt === 'inzetbevestiging') {
    const ext = combined.trim()
      ? await extraheertInzetdocument(factuur.onderwerp ?? '', combined)
      : null;

    const berijderNaam = ext?.berijder_voornaam || ext?.berijder_achternaam
      ? [ext.berijder_voornaam, ext.berijder_achternaam].filter(Boolean).join(' ')
      : (factuur.berijder_naam ?? null);

    // RDW alleen bij inzetbevestiging (heeft kenteken)
    let rdwData = factuur.rdw_data;
    const kenteken = ext?.kenteken ?? factuur.kenteken ?? null;
    if (dt === 'inzetbevestiging' && kenteken) {
      try {
        const rdw = await rdwOpzoeken(kenteken);
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

    update = {
      contractnummer:    ext?.contractnummer    ?? factuur.contractnummer,
      merk_model:        ext?.merk_model        ?? factuur.merk_model,
      kenteken:          kenteken,
      looptijd_maanden:  ext?.looptijd_maanden  ?? factuur.looptijd_maanden,
      jaarkilometrage:   ext?.jaarkilometrage   ?? factuur.jaarkilometrage,
      type_aanschaf:     ext?.type_aanschaf     ?? factuur.type_aanschaf,
      banden:            ext?.banden            ?? factuur.banden,
      inzetdatum:        ext?.inzetdatum        ?? factuur.inzetdatum,
      leasemaatschappij: ext?.leasemaatschappij_naam ?? factuur.leasemaatschappij,
      bedrijfsnaam:      ext?.bedrijf_naam      ?? factuur.bedrijfsnaam,
      kvk:               ext?.bedrijf_kvk       ?? factuur.kvk,
      straat:            ext?.bedrijf_adres     ?? factuur.straat,
      postcode:          ext?.bedrijf_postcode  ?? factuur.postcode,
      plaats:            ext?.bedrijf_stad      ?? factuur.plaats,
      berijder_naam:     berijderNaam,
      berijder_email:    ext?.berijder_email    ?? factuur.berijder_email,
      extracted_data:    ext ?? factuur.extracted_data,
      rdw_data:          rdwData,
    };

  } else if (dt === 'autokosten') {
    const ext = combined.trim()
      ? await extraheertAutokosten(factuur.onderwerp ?? '', combined)
      : null;

    let rdwData = factuur.rdw_data;
    const kenteken = ext?.kenteken ?? factuur.kenteken ?? null;
    if (kenteken) {
      try {
        const rdw = await rdwOpzoeken(kenteken);
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

    update = {
      kenteken:         kenteken,
      bedrijfsnaam:     ext?.garage_naam      ?? factuur.bedrijfsnaam,
      factuurnummer:    ext?.factuurnummer    ?? factuur.factuurnummer,
      factuurdatum:     ext?.factuurdatum     ?? factuur.factuurdatum,
      bedrag_excl_btw:  ext?.bedrag_excl_btw  ?? factuur.bedrag_excl_btw,
      bedrag_incl_btw:  ext?.bedrag_incl_btw  ?? factuur.bedrag_incl_btw,
      extracted_data:   ext ?? factuur.extracted_data,
      rdw_data:         rdwData,
    };

  } else {
    // factuur (default)
    const extract = combined.trim() ? await parseFactuurTekst(combined) : null;

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

    update = {
      factuurnummer:   extract?.factuurnummer   ?? factuur.factuurnummer,
      factuurdatum:    extract?.factuurdatum    ?? factuur.factuurdatum,
      kenteken:        extract?.kenteken        ?? factuur.kenteken,
      bedrijfsnaam:    extract?.bedrijfsnaam    ?? factuur.bedrijfsnaam,
      kvk:             extract?.kvk             ?? null,
      is_bedrijf:      extract?.is_bedrijf      ?? factuur.is_bedrijf,
      berijder_naam:   extract?.berijder_naam   ?? factuur.berijder_naam,
      berijder_email:  extract?.berijder_email  ?? factuur.berijder_email,
      bedrag_excl_btw: extract?.bedrag_excl_btw ?? factuur.bedrag_excl_btw,
      bedrag_incl_btw: extract?.bedrag_incl_btw ?? factuur.bedrag_incl_btw,
      straat:          extract?.straat          ?? factuur.straat,
      postcode:        extract?.postcode        ?? factuur.postcode,
      plaats:          extract?.plaats          ?? factuur.plaats,
      land:            extract?.land            ?? factuur.land,
      extracted_data:  extract                  ?? factuur.extracted_data,
      rdw_data:        rdwData,
    };
  }

  const { error: upErr } = await admin.from('facturen').update(update).eq('id', id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
