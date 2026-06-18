// Goedkeuren factuur → wegschrijven naar HubSpot.
// Stappen:
//  1. Lees factuur uit Supabase
//  2. Verplichte velden checken (kenteken + bedrijfsnaam)
//  3. Company: search op naam, anders create
//  4. Contact: search op email of naam, anders create
//  5. Deal: search op kenteken, anders create (inzetdatum = factuurdatum)
//  6. Associaties leggen
//  7. factuur-record updaten met hubspot_*_id + status='goedgekeurd' + archief

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  findCompany, createCompany, searchCompanyByKvk, updateCompany,
  searchContactByEmail, searchContactByName, createContact,
  searchDealByKenteken, createDeal,
  associateDealCompany, associateDealContact, associateContactCompany,
  uploadFile, createNoteOnDeal,
} from '@/lib/hubspot';
import { kvkOpzoeken } from '@/lib/kvk';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// RDW geeft labels als "Benzine", "Diesel", "Elektriciteit", "LPG", "Waterstof",
// "CNG", "Alcohol". HubSpot enum verwacht specifieke waarden zoals "Elektrisch"
// en "LPG Benzine". Mapping naar het dichtstbijzijnde HubSpot-label.
function mapBrandstof(rdwLabel?: string | null): string | undefined {
  if (!rdwLabel) return undefined;
  const l = rdwLabel.trim().toLowerCase();
  if (l.startsWith('benzine')) return 'Benzine';
  if (l.startsWith('diesel'))  return 'Diesel';
  if (l.startsWith('elektri')) return 'Elektrisch';
  if (l.startsWith('waterstof')) return 'Waterstof';
  if (l.startsWith('lpg'))     return 'LPG Benzine';
  // CNG / Alcohol / overig — geen exact equivalent, laten ophalen via UI
  return undefined;
}

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

  const { data: factuur, error: leesErr } = await admin
    .from('facturen').select('*').eq('id', id).single();

  if (leesErr || !factuur) {
    return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 });
  }

  if (!factuur.kenteken?.trim()) {
    return NextResponse.json({ error: 'Kenteken ontbreekt' }, { status: 400 });
  }
  const isBedrijf = factuur.is_bedrijf !== false; // default true bij oude rijen
  if (isBedrijf && !factuur.bedrijfsnaam?.trim()) {
    return NextResponse.json({ error: 'Bedrijfsnaam ontbreekt (zakelijk)' }, { status: 400 });
  }
  if (!isBedrijf && !factuur.berijder_naam?.trim()) {
    return NextResponse.json({ error: 'Berijder-naam ontbreekt (particulier)' }, { status: 400 });
  }

  try {
    // ── KVK-verrijking ──────────────────────────────────
    const kvkData = factuur.kvk ? await kvkOpzoeken(factuur.kvk) : null;

    // ── Company (alleen bij zakelijke klant) ────────────
    let companyId: string | null = null;
    if (isBedrijf && factuur.bedrijfsnaam) {
      // Zoek eerst op KVK-nummer (meest betrouwbaar)
      if (factuur.kvk) {
        companyId = await searchCompanyByKvk(factuur.kvk);
      }
      // Daarna op naam/postcode (met KVK-adres als fallback)
      if (!companyId) {
        companyId = await findCompany({
          name: factuur.bedrijfsnaam,
          postcode: factuur.postcode ?? kvkData?.postcode,
          plaats: factuur.plaats ?? kvkData?.plaats,
        });
      }
      if (!companyId) {
        // Nieuw bedrijf aanmaken — KVK-data heeft prioriteit boven factuurdata
        companyId = await createCompany({
          name: factuur.bedrijfsnaam,
          kvk: factuur.kvk ?? undefined,
          address: kvkData?.straat ?? factuur.straat ?? undefined,
          zip: kvkData?.postcode ?? factuur.postcode ?? undefined,
          city: kvkData?.plaats ?? factuur.plaats ?? undefined,
          country: kvkData?.land ?? factuur.land ?? undefined,
          domain: kvkData?.website,
        });
      } else if (kvkData) {
        // Bestaand bedrijf verrijken met officiële KVK-data
        await updateCompany(companyId, {
          kvk: factuur.kvk ?? undefined,
          address: kvkData.straat,
          zip: kvkData.postcode,
          city: kvkData.plaats,
          country: kvkData.land,
          domain: kvkData.website,
        });
      }
    }

    // ── Contact ─────────────────────────────────────────
    let contactId: string | null = null;
    if (factuur.berijder_email) {
      contactId = await searchContactByEmail(factuur.berijder_email);
    }
    if (!contactId && factuur.berijder_naam) {
      const [voor, ...rest] = factuur.berijder_naam.trim().split(/\s+/);
      const achter = rest.join(' ');
      if (voor && achter) {
        contactId = await searchContactByName(voor, achter);
      }
    }
    if (!contactId && (factuur.berijder_email || factuur.berijder_naam)) {
      const [voor, ...rest] = (factuur.berijder_naam ?? '').trim().split(/\s+/);
      // Bij particulier nemen we adres mee op het Contact-record zodat het
      // niet als losse persoon zonder context in HubSpot staat.
      const extra = isBedrijf ? {} : {
        address: factuur.straat ?? undefined,
        zip: factuur.postcode ?? undefined,
        city: factuur.plaats ?? undefined,
        country: factuur.land ?? undefined,
      };
      contactId = await createContact({
        email: factuur.berijder_email ?? undefined,
        firstname: voor || undefined,
        lastname: rest.join(' ') || undefined,
        ...extra,
      });
    }

    // ── Deal (auto) ─────────────────────────────────────
    const rdw = factuur.rdw_data as {
      merk?: string; handelsbenaming?: string; brandstof?: string | null;
      catalogusprijs?: number | null; apkDatum?: string | null;
    } | null;
    const merkType = rdw?.merk && rdw?.handelsbenaming
      ? `${rdw.merk} ${rdw.handelsbenaming}`.trim()
      : undefined;

    let dealId = await searchDealByKenteken(factuur.kenteken);
    if (!dealId) {
      // Converteer APK "dd-mm-yyyy" → ISO
      let apkIso: string | undefined;
      if (rdw?.apkDatum) {
        const [d, m, y] = rdw.apkDatum.split('-');
        if (d && m && y) apkIso = `${y}-${m}-${d}`;
      }
      dealId = await createDeal({
        kenteken: factuur.kenteken,
        inzetdatum: factuur.factuurdatum ?? undefined,
        merk_type: merkType,
        brandstof: mapBrandstof(rdw?.brandstof ?? undefined),
        apk_datum: apkIso,
        fiscale_waarde: rdw?.catalogusprijs ?? undefined,
        // Defaults voor PEPE-verkoop via factuur:
        type_aanschaf: 'Aanschaf',          // toont in HubSpot als "Eigendom"
        leverancier: 'PEPE Wagenparkbeheer',
        land_kenteken: 'NL',
      });
    }

    // ── Associaties ─────────────────────────────────────
    if (companyId) {
      await associateDealCompany(dealId, companyId);
    }
    if (contactId) {
      await associateDealContact(dealId, contactId);
      if (companyId) {
        await associateContactCompany(contactId, companyId);
      }
    }

    // ── Kopie factuur als aantekening (notitie + bijlage) op de deal ──
    // Best-effort: lukt dit niet (bv. ontbrekende 'files'-scope), dan blijft de
    // goedkeuring gewoon slagen. De PDF-bijlage is een extraatje.
    if (factuur.pdf_storage_path) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from('facturen').download(factuur.pdf_storage_path);
        if (!dlErr && blob) {
          const naam = `Factuur ${factuur.factuurnummer ?? id}.pdf`;
          const fileId = await uploadFile(await blob.arrayBuffer(), naam);
          const bedrag = factuur.bedrag_incl_btw != null
            ? `€ ${Number(factuur.bedrag_incl_btw).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
            : '';
          const regels = [
            `<strong>Factuur ${factuur.factuurnummer ?? ''}</strong>`,
            factuur.bedrijfsnaam ? `Leverancier: ${factuur.bedrijfsnaam}` : '',
            bedrag ? `Bedrag incl. btw: ${bedrag}` : '',
            `Goedgekeurd in Flow op ${new Date().toLocaleDateString('nl-NL')}.`,
          ].filter(Boolean).map((r) => `<p>${r}</p>`).join('');
          await createNoteOnDeal(dealId, regels, fileId);
        }
      } catch (e) {
        console.error('factuur-bijlage naar HubSpot mislukt (niet-blokkerend):', (e as Error).message);
      }
    }

    // ── Update factuur-record ───────────────────────────
    const { error: updateErr } = await admin.from('facturen').update({
      hubspot_company_id: companyId,
      hubspot_contact_id: contactId,
      hubspot_deal_id: dealId,
      hubspot_synced_at: new Date().toISOString(),
      hubspot_error: null,
      status: 'goedgekeurd',
      gearchiveerd: true,
    }).eq('id', id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      hubspot: { companyId, contactId, dealId },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('facturen approve fout:', msg);
    await admin.from('facturen').update({
      status: 'gefaald',
      hubspot_error: msg,
    }).eq('id', id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
