// Handler voor factuur-approve: company/contact/deal in HubSpot + PDF-note.
// Geëxtraheerd uit de originele approve/route.ts om de router clean te houden.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findCompany, createCompany, searchCompanyByKvk, updateCompany,
  searchContactByEmail, searchContactByName, createContact,
  searchDealByKenteken, createDeal,
  associateDealCompany, associateDealContact, associateContactCompany,
  uploadFile, createNoteOnDeal,
} from '@/lib/hubspot';
import { kvkOpzoeken } from '@/lib/kvk';
import type { MatchKeuze } from '@/types/match';

function mapBrandstof(rdwLabel?: string | null): string | undefined {
  if (!rdwLabel) return undefined;
  const l = rdwLabel.trim().toLowerCase();
  if (l.startsWith('benzine')) return 'Benzine';
  if (l.startsWith('diesel')) return 'Diesel';
  if (l.startsWith('elektri')) return 'Elektrisch';
  if (l.startsWith('waterstof')) return 'Waterstof';
  if (l.startsWith('lpg')) return 'LPG Benzine';
  return undefined;
}

export async function approveFactuur(
  factuur: Record<string, unknown>,
  admin: SupabaseClient,
  match?: MatchKeuze,
): Promise<{ companyId: string | null; contactId: string | null; dealId: string }> {
  if (!String(factuur.kenteken ?? '').trim()) throw new Error('Kenteken ontbreekt');
  const isBedrijf = factuur.is_bedrijf !== false;
  if (isBedrijf && !String(factuur.bedrijfsnaam ?? '').trim()) {
    throw new Error('Bedrijfsnaam ontbreekt (zakelijk)');
  }
  if (!isBedrijf && !String(factuur.berijder_naam ?? '').trim()) {
    throw new Error('Berijder-naam ontbreekt (particulier)');
  }

  const kvkData = factuur.kvk ? await kvkOpzoeken(String(factuur.kvk)) : null;

  let companyId: string | null = null;
  if (isBedrijf && factuur.bedrijfsnaam) {
    const naam = String(factuur.bedrijfsnaam);
    if (match?.bedrijfId !== undefined) {
      companyId = match.bedrijfId;
    } else {
      if (factuur.kvk) companyId = await searchCompanyByKvk(String(factuur.kvk));
      if (!companyId) companyId = await findCompany({
        name: naam,
        postcode: (factuur.postcode ?? kvkData?.postcode) as string | undefined,
        plaats: (factuur.plaats ?? kvkData?.plaats) as string | undefined,
      });
    }
    if (!companyId) {
      companyId = await createCompany({
        name: naam,
        kvk: factuur.kvk ? String(factuur.kvk) : undefined,
        address: kvkData?.straat ?? (factuur.straat ? String(factuur.straat) : undefined),
        zip: kvkData?.postcode ?? (factuur.postcode ? String(factuur.postcode) : undefined),
        city: kvkData?.plaats ?? (factuur.plaats ? String(factuur.plaats) : undefined),
        country: kvkData?.land ?? (factuur.land ? String(factuur.land) : undefined),
        domain: kvkData?.website,
      });
    } else if (kvkData) {
      await updateCompany(companyId, {
        kvk: factuur.kvk ? String(factuur.kvk) : undefined,
        address: kvkData.straat,
        zip: kvkData.postcode,
        city: kvkData.plaats,
        country: kvkData.land,
        domain: kvkData.website,
      });
    }
  }

  let contactId: string | null = null;
  if (match?.berijderId !== undefined) {
    contactId = match.berijderId;
  } else {
    if (factuur.berijder_email) contactId = await searchContactByEmail(String(factuur.berijder_email));
    if (!contactId && factuur.berijder_naam) {
      const [voor, ...rest] = String(factuur.berijder_naam).trim().split(/\s+/);
      if (voor && rest.length) contactId = await searchContactByName(voor, rest.join(' '));
    }
  }
  if (!contactId && (factuur.berijder_email || factuur.berijder_naam)) {
    const [voor, ...rest] = String(factuur.berijder_naam ?? '').trim().split(/\s+/);
    const extra = isBedrijf ? {} : {
      address: factuur.straat ? String(factuur.straat) : undefined,
      zip: factuur.postcode ? String(factuur.postcode) : undefined,
      city: factuur.plaats ? String(factuur.plaats) : undefined,
      country: factuur.land ? String(factuur.land) : undefined,
    };
    contactId = await createContact({
      email: factuur.berijder_email ? String(factuur.berijder_email) : undefined,
      firstname: voor || undefined,
      lastname: rest.join(' ') || undefined,
      ...extra,
    });
  }

  const rdw = factuur.rdw_data as {
    merk?: string; handelsbenaming?: string; brandstof?: string | null;
    catalogusprijs?: number | null; apkDatum?: string | null;
  } | null;
  const merkType = rdw?.merk && rdw?.handelsbenaming
    ? `${rdw.merk} ${rdw.handelsbenaming}`.trim() : undefined;

  const kenteken = String(factuur.kenteken);
  let dealId = await searchDealByKenteken(kenteken);
  if (!dealId) {
    let apkIso: string | undefined;
    if (rdw?.apkDatum) {
      const [d, m, y] = rdw.apkDatum.split('-');
      if (d && m && y) apkIso = `${y}-${m}-${d}`;
    }
    dealId = await createDeal({
      kenteken,
      inzetdatum: factuur.factuurdatum ? String(factuur.factuurdatum) : undefined,
      merk_type: merkType,
      brandstof: mapBrandstof(rdw?.brandstof),
      apk_datum: apkIso,
      fiscale_waarde: rdw?.catalogusprijs ?? undefined,
      type_aanschaf: 'Aanschaf',
      leverancier: 'PEPE Wagenparkbeheer',
      land_kenteken: 'NL',
    });
  }

  if (companyId) await associateDealCompany(dealId, companyId);
  if (contactId) {
    await associateDealContact(dealId, contactId);
    if (companyId) await associateContactCompany(contactId, companyId);
  }

  if (factuur.pdf_storage_path) {
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from('facturen').download(String(factuur.pdf_storage_path));
      if (!dlErr && blob) {
        const naam = `Factuur ${factuur.factuurnummer ?? factuur.id}.pdf`;
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
      console.error('factuur-bijlage naar HubSpot mislukt:', (e as Error).message);
    }
  }

  return { companyId, contactId, dealId };
}
