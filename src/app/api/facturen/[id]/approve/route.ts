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
  searchCompanyByName, createCompany,
  searchContactByEmail, searchContactByName, createContact,
  searchDealByKenteken, createDeal,
  associateDealCompany, associateDealContact, associateContactCompany,
} from '@/lib/hubspot';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
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
  if (!factuur.bedrijfsnaam?.trim()) {
    return NextResponse.json({ error: 'Bedrijfsnaam ontbreekt' }, { status: 400 });
  }

  try {
    // ── Company ─────────────────────────────────────────
    let companyId = await searchCompanyByName(factuur.bedrijfsnaam);
    if (!companyId) {
      companyId = await createCompany({
        name: factuur.bedrijfsnaam,
        kvk: factuur.kvk ?? undefined,
        address: factuur.straat ?? undefined,
        zip: factuur.postcode ?? undefined,
        city: factuur.plaats ?? undefined,
        country: factuur.land ?? undefined,
      });
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
      contactId = await createContact({
        email: factuur.berijder_email ?? undefined,
        firstname: voor || undefined,
        lastname: rest.join(' ') || undefined,
      });
    }

    // ── Deal (auto) ─────────────────────────────────────
    const rdw = factuur.rdw_data as { merk?: string; handelsbenaming?: string; brandstof?: string; apkDatum?: string } | null;
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
        brandstof: rdw?.brandstof,
        apk_datum: apkIso,
      });
    }

    // ── Associaties ─────────────────────────────────────
    await associateDealCompany(dealId, companyId);
    if (contactId) {
      await associateDealContact(dealId, contactId);
      await associateContactCompany(contactId, companyId);
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
