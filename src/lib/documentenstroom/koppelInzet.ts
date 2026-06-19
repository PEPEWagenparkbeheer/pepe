// Gedeelde helper: koppelt InzetdocumentExtract aan HubSpot.
// Gebruikt vanuit zowel brein/koppel/route.ts (mail-gebaseerd)
// als documentenstroom approve/inzetbevestiging.ts (PDF-inbox).
import type { InzetdocumentExtract } from '@/lib/brein/inzetdocument';
import {
  searchContactByEmail, searchContactByName, createContact,
  findCompany, searchCompanyByKvk, createCompany, updateCompany,
  searchDealByName, searchDealByKenteken, createDeal, updateDealFields,
  associateDealContact, associateDealCompany, associateContactCompany,
  uploadFile, createNoteOnDeal,
  DEALSTAGE_RIJDEND,
} from '@/lib/hubspot';

export interface KoppelInzetResult {
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  log: string[];
}

function berekenEinddatum(inzetdatum: string, looptijdMaanden: number): string {
  const d = new Date(inzetdatum);
  d.setMonth(d.getMonth() + looptijdMaanden);
  return d.toISOString().slice(0, 10);
}

export async function koppelInzet(
  ext: InzetdocumentExtract,
  options?: { pdfBuffer?: ArrayBuffer; pdfNaam?: string },
): Promise<KoppelInzetResult> {
  const log: string[] = [];

  // ── BERIJDER (Contact) ───────────────────────────────────────
  let contactId: string | null = null;
  const email = ext.berijder_email?.trim().toLowerCase() || null;
  const voornaam = ext.berijder_voornaam?.trim() || null;
  const achternaam = ext.berijder_achternaam?.trim() || null;

  if (email) contactId = await searchContactByEmail(email);
  if (!contactId && voornaam && achternaam) {
    contactId = await searchContactByName(voornaam, achternaam);
  }

  if (!contactId) {
    if (email || (voornaam && achternaam)) {
      contactId = await createContact({
        email: email ?? undefined,
        firstname: voornaam ?? undefined,
        lastname: achternaam ?? undefined,
        phone: ext.berijder_telefoon ?? undefined,
        address: ext.berijder_adres ?? undefined,
        city: ext.berijder_stad ?? undefined,
        zip: ext.berijder_postcode ?? undefined,
      });
      log.push(`Contact aangemaakt: ${voornaam ?? ''} ${achternaam ?? ''} (${email ?? 'geen email'})`);
    } else {
      log.push('Geen berijdergegevens gevonden om contact aan te maken.');
    }
  } else {
    log.push(`Contact gevonden: ${contactId}`);
  }

  // ── BEDRIJF (Company) ────────────────────────────────────────
  let companyId: string | null = null;
  if (ext.bedrijf_naam) {
    if (ext.bedrijf_kvk) companyId = await searchCompanyByKvk(ext.bedrijf_kvk);
    if (!companyId) {
      companyId = await findCompany({
        name: ext.bedrijf_naam,
        postcode: ext.bedrijf_postcode,
        plaats: ext.bedrijf_stad,
      });
    }
    if (!companyId) {
      companyId = await createCompany({
        name: ext.bedrijf_naam,
        kvk: ext.bedrijf_kvk ?? undefined,
        address: ext.bedrijf_adres ?? undefined,
        city: ext.bedrijf_stad ?? undefined,
        zip: ext.bedrijf_postcode ?? undefined,
      });
      log.push(`Bedrijf aangemaakt: ${ext.bedrijf_naam}`);
    } else {
      if (ext.bedrijf_kvk || ext.bedrijf_adres) {
        await updateCompany(companyId, {
          kvk: ext.bedrijf_kvk ?? undefined,
          address: ext.bedrijf_adres ?? undefined,
          city: ext.bedrijf_stad ?? undefined,
          zip: ext.bedrijf_postcode ?? undefined,
        });
      }
      log.push(`Bedrijf gevonden: ${ext.bedrijf_naam} (${companyId})`);
    }
  }

  // ── DEAL (Auto) ──────────────────────────────────────────────
  // InBestelling [contractnummer] → hernoem naar kenteken + zet rijdend.
  // Fallback: zoek op kenteken. Geen kenteken → geen deal.
  let dealId: string | null = null;
  let dealViaContractnummer = false;

  if (ext.contractnummer) {
    dealId = await searchDealByName(`InBestelling ${ext.contractnummer}`);
    if (dealId) {
      dealViaContractnummer = true;
      log.push(`Deal gevonden via contractnummer: InBestelling ${ext.contractnummer}`);
    }
  }
  if (!dealId && ext.kenteken) {
    dealId = await searchDealByKenteken(ext.kenteken);
  }

  if (ext.kenteken) {
    const einddatum =
      ext.inzetdatum && ext.looptijd_maanden
        ? berekenEinddatum(ext.inzetdatum, ext.looptijd_maanden)
        : null;

    const dealProperties: Record<string, string> = {
      dealstage: DEALSTAGE_RIJDEND,
    };
    if (dealViaContractnummer) {
      dealProperties.dealname = ext.kenteken.replace(/\s+/g, '').toUpperCase();
      log.push(`Deal hernoemd naar kenteken: ${dealProperties.dealname}`);
    }
    if (ext.merk_model) dealProperties.merk___type = ext.merk_model;
    if (ext.brandstof) dealProperties.brandstof = ext.brandstof;
    if (ext.type_aanschaf) dealProperties.type_aanschaf = ext.type_aanschaf;
    if (ext.fiscale_waarde != null) dealProperties.fiscale_waarde = String(ext.fiscale_waarde);
    if (ext.inzetdatum) dealProperties.inzetdatum = ext.inzetdatum;
    if (einddatum) dealProperties.verwachte_einddatum = einddatum;
    if (ext.leasemaatschappij_naam) dealProperties.leasemaatschappij_goed = ext.leasemaatschappij_naam;
    if (ext.jaarkilometrage != null) dealProperties.jaarkilometrage = String(ext.jaarkilometrage);

    if (dealId) {
      await updateDealFields(dealId, dealProperties);
      log.push(`Deal gevonden en bijgewerkt: ${ext.kenteken} → Rijdend`);
    } else {
      dealId = await createDeal({
        kenteken: ext.kenteken,
        merk_type: ext.merk_model ?? undefined,
        brandstof: ext.brandstof ?? undefined,
        type_aanschaf: ext.type_aanschaf ?? undefined,
        fiscale_waarde: ext.fiscale_waarde ?? undefined,
        inzetdatum: ext.inzetdatum ?? undefined,
        dealstage: DEALSTAGE_RIJDEND,
      });
      if (einddatum || ext.leasemaatschappij_naam || ext.jaarkilometrage) {
        await updateDealFields(dealId, dealProperties);
      }
      log.push(`Deal aangemaakt: ${ext.kenteken}`);
    }

    // Associaties
    if (contactId) {
      await associateDealContact(dealId, contactId);
      log.push('Deal gekoppeld aan berijder');
    }
    if (companyId) {
      await associateDealCompany(dealId, companyId);
      log.push('Deal gekoppeld aan bedrijf');
    }

    // Notitie op deal (met optionele PDF-bijlage)
    const notitieRegels: string[] = ['<b>Inzetdocument verwerkt</b><br>'];
    if (ext.contractnummer) notitieRegels.push(`Contractnummer: ${ext.contractnummer}`);
    if (ext.inzetdatum) notitieRegels.push(`Inzetdatum: ${ext.inzetdatum}`);
    if (ext.looptijd_maanden) notitieRegels.push(`Looptijd: ${ext.looptijd_maanden} maanden`);
    if (ext.jaarkilometrage) notitieRegels.push(`Jaarkilometrage: ${ext.jaarkilometrage.toLocaleString('nl-NL')} km`);
    if (ext.fiscale_waarde) notitieRegels.push(`Fiscale waarde: € ${ext.fiscale_waarde.toLocaleString('nl-NL')}`);
    if (ext.leasemaatschappij_naam) {
      notitieRegels.push(`<br><b>Leasemaatschappij:</b> ${ext.leasemaatschappij_naam}`);
      if (ext.leasemaatschappij_referentie) notitieRegels.push(`Referentie: ${ext.leasemaatschappij_referentie}`);
      if (ext.leasemaatschappij_contactpersoon) notitieRegels.push(`Contactpersoon: ${ext.leasemaatschappij_contactpersoon}`);
      if (ext.leasemaatschappij_email) notitieRegels.push(`E-mail: ${ext.leasemaatschappij_email}`);
      if (ext.leasemaatschappij_telefoon) notitieRegels.push(`Telefoon: ${ext.leasemaatschappij_telefoon}`);
    }
    if (ext.berijder_voornaam || ext.berijder_achternaam) {
      notitieRegels.push(`<br><b>Berijder:</b> ${[ext.berijder_voornaam, ext.berijder_achternaam].filter(Boolean).join(' ')}`);
      if (ext.berijder_email) notitieRegels.push(`E-mail: ${ext.berijder_email}`);
      if (ext.berijder_adres) notitieRegels.push(`Adres: ${ext.berijder_adres}, ${ext.berijder_postcode ?? ''} ${ext.berijder_stad ?? ''}`);
    }
    if (ext.bedrijf_naam) {
      notitieRegels.push(`<br><b>Bedrijf:</b> ${ext.bedrijf_naam}`);
      if (ext.bedrijf_kvk) notitieRegels.push(`KvK: ${ext.bedrijf_kvk}`);
    }

    let fileId: string | undefined;
    if (options?.pdfBuffer && options.pdfNaam) {
      try {
        fileId = await uploadFile(options.pdfBuffer, options.pdfNaam);
      } catch (e) {
        console.error('koppelInzet PDF-upload mislukt:', (e as Error).message);
      }
    }
    await createNoteOnDeal(dealId, notitieRegels.join('<br>'), fileId);
    log.push('Notitie aangemaakt op deal');
  } else {
    log.push('Geen kenteken gevonden — deal niet aangemaakt.');
  }

  // Koppel contact aan bedrijf
  if (contactId && companyId) {
    await associateContactCompany(contactId, companyId);
    log.push('Berijder gekoppeld aan bedrijf');
  }

  return { contactId, companyId, dealId, log };
}
