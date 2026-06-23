// Handler voor bestelbevestiging-approve.
// Maakt deal "InBestelling [contractnummer]" in fase "In bestelling" (DEALSTAGE_IN_BESTELLING).
// Bestelbevestigingen hebben geen kenteken — het kenteken volgt bij inzetbevestiging (Fase 3).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findCompany, createCompany, searchCompanyByKvk, updateCompany,
  searchContactByEmail, searchContactByName, createContact, updateContact,
  searchDealByName, searchDealByContractnummer, createDeal, updateDealFields,
  associateDealCompany, associateDealContact, associateContactCompany,
  uploadFile, createNoteOnDeal, mapLeasemaatschappij,
  DEALSTAGE_IN_BESTELLING,
} from '@/lib/hubspot';
import { kvkOpzoeken } from '@/lib/kvk';

// HubSpot-opties voor winterbanden_in_contract: Ja | Nee | 4-seizoenen | Onbekend
function mapBanden(banden?: string | null): string | undefined {
  if (!banden) return undefined;
  const b = banden.toLowerCase();
  if (b.includes('winter')) return 'Ja';
  if (b.includes('all') || b.includes('seizoen')) return '4-seizoenen';
  if (b.includes('zomer')) return 'Nee';
  return 'Onbekend';
}

export async function approveBestelbevestiging(
  factuur: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<{ companyId: string | null; contactId: string | null; dealId: string }> {
  const contractnummer = String(factuur.contractnummer ?? '').trim();
  if (!contractnummer) throw new Error('Contractnummer ontbreekt');

  const kvkData = factuur.kvk ? await kvkOpzoeken(String(factuur.kvk)) : null;
  const ext = factuur.extracted_data as Record<string, unknown> | null;

  // ── Company: eerst matchen (KVK → naam+adres), pas anders aanmaken ──
  let companyId: string | null = null;
  if (factuur.bedrijfsnaam) {
    const naam = String(factuur.bedrijfsnaam);
    // Beste bekende NAW (KVK-verrijking heeft voorrang op het document)
    const adres = kvkData?.straat ?? (factuur.straat ? String(factuur.straat) : undefined);
    const zip = kvkData?.postcode ?? (factuur.postcode ? String(factuur.postcode) : undefined);
    const city = kvkData?.plaats ?? (factuur.plaats ? String(factuur.plaats) : undefined);
    const country = kvkData?.land ?? (factuur.land ? String(factuur.land) : undefined);

    if (factuur.kvk) companyId = await searchCompanyByKvk(String(factuur.kvk));
    if (!companyId) {
      companyId = await findCompany({ name: naam, postcode: zip, plaats: city, adres });
    }
    if (!companyId) {
      companyId = await createCompany({
        name: naam,
        kvk: factuur.kvk ? String(factuur.kvk) : undefined,
        address: adres, zip, city, country, domain: kvkData?.website,
      });
    } else {
      // Bestaand bedrijf gematcht → bijwerken met de bekende (niet-lege) gegevens
      await updateCompany(companyId, {
        kvk: factuur.kvk ? String(factuur.kvk) : undefined,
        address: adres, zip, city, country, domain: kvkData?.website,
      });
    }
  }

  // ── Contact (berijder): eerst matchen op email, dan naam ──
  const [voor, ...rest] = String(factuur.berijder_naam ?? '').trim().split(/\s+/);
  const berijderInput = {
    email: factuur.berijder_email ? String(factuur.berijder_email) : undefined,
    firstname: voor || undefined,
    lastname: rest.join(' ') || undefined,
    phone: ext?.berijder_telefoon ? String(ext.berijder_telefoon) : undefined,
    address: ext?.berijder_adres ? String(ext.berijder_adres) : undefined,
    zip: ext?.berijder_postcode ? String(ext.berijder_postcode) : undefined,
    city: ext?.berijder_stad ? String(ext.berijder_stad) : undefined,
  };

  let contactId: string | null = null;
  if (factuur.berijder_email) {
    contactId = await searchContactByEmail(String(factuur.berijder_email));
  }
  if (!contactId && voor && rest.length) {
    contactId = await searchContactByName(voor, rest.join(' '));
  }
  if (!contactId && (factuur.berijder_email || factuur.berijder_naam)) {
    contactId = await createContact(berijderInput);
  } else if (contactId) {
    // Bestaande berijder gematcht → bijwerken met de bekende (niet-lege) gegevens
    await updateContact(contactId, berijderInput);
  }

  // Extra velden uit extracted_data JSON
  const leverendeDealerUitDoc = ext?.leverende_dealer ? String(ext.leverende_dealer) : undefined;
  const leasebedragUitDoc = ext?.leasebedrag_per_maand != null ? Number(ext.leasebedrag_per_maand) : null;
  const verwachteLeverdatumUitDoc = ext?.verwachte_leverdatum ? String(ext.verwachte_leverdatum) : undefined;
  const fiscaleWaarde = ext?.fiscale_waarde;

  // ── Deal: matchen op contractnummer (naam óf contractnummer_lease) ──
  const dealNaam = `InBestelling ${contractnummer}`;
  let dealId = await searchDealByName(dealNaam);
  if (!dealId) dealId = await searchDealByContractnummer(contractnummer);
  if (!dealId) {
    dealId = await createDeal({
      kenteken: contractnummer,
      dealname: dealNaam,
      dealstage: DEALSTAGE_IN_BESTELLING,
      leverancier: leverendeDealerUitDoc,
      land_kenteken: 'NL',
    });
  }

  // Deal-velden aanvullen vanuit het document
  const dealProps: Record<string, string> = {};
  if (factuur.merk_model) dealProps.merk___type = String(factuur.merk_model);
  if (factuur.brandstof) dealProps.brandstof = String(factuur.brandstof);
  if (factuur.type_aanschaf) dealProps.type_aanschaf = String(factuur.type_aanschaf);
  if (factuur.looptijd_maanden != null) dealProps.looptijd = String(factuur.looptijd_maanden);
  if (factuur.jaarkilometrage != null) dealProps.kilometers_per_jaar = String(factuur.jaarkilometrage);
  if (factuur.leasemaatschappij) {
    const isShortlease = /short/i.test(`${factuur.type_aanschaf ?? ''} ${factuur.leasemaatschappij}`);
    dealProps.leasemaatschappij_goed = mapLeasemaatschappij(String(factuur.leasemaatschappij), isShortlease);
  }
  const bandenMapped = mapBanden(factuur.banden ? String(factuur.banden) : null);
  if (bandenMapped) dealProps.winterbanden_in_contract = bandenMapped;
  if (fiscaleWaarde != null) dealProps.fiscale_waarde = String(fiscaleWaarde);
  dealProps.contractnummer_lease = contractnummer;
  if (leverendeDealerUitDoc) dealProps.leverancier = leverendeDealerUitDoc;
  if (leasebedragUitDoc != null) dealProps.leasebedrag_per_maand_excl__btw = String(leasebedragUitDoc);
  if (verwachteLeverdatumUitDoc) dealProps.verwachte_leverdatum = verwachteLeverdatumUitDoc;

  if (Object.keys(dealProps).length) {
    await updateDealFields(dealId, dealProps);
  }

  // ── Associaties ───────────────────────────────────
  if (companyId) await associateDealCompany(dealId, companyId);
  if (contactId) {
    await associateDealContact(dealId, contactId);
    if (companyId) await associateContactCompany(contactId, companyId);
  }

  // ── PDF-kopie op deal (best-effort) ───────────────
  if (factuur.pdf_storage_path) {
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from('facturen').download(String(factuur.pdf_storage_path));
      if (!dlErr && blob) {
        const naam = `Bestelbevestiging ${contractnummer}.pdf`;
        const fileId = await uploadFile(await blob.arrayBuffer(), naam);
        const regels = [
          `<strong>Bestelbevestiging ${contractnummer}</strong>`,
          factuur.merk_model ? `Auto: ${factuur.merk_model}` : '',
          factuur.leasemaatschappij ? `Leasemaatschappij: ${factuur.leasemaatschappij}` : '',
          `Verwerkt in Flow op ${new Date().toLocaleDateString('nl-NL')}.`,
        ].filter(Boolean).map((r) => `<p>${r}</p>`).join('');
        await createNoteOnDeal(dealId, regels, fileId);
      }
    } catch (e) {
      console.error('bestelbevestiging-bijlage naar HubSpot mislukt:', (e as Error).message);
    }
  }

  return { companyId, contactId, dealId };
}
