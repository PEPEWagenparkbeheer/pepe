// Handler voor inzetbevestiging-approve.
// Reconstrueert InzetdocumentExtract uit het factuur-record en roept koppelInzet aan.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InzetdocumentExtract } from '@/lib/brein/inzetdocument';
import { koppelInzet } from '@/lib/documentenstroom/koppelInzet';

export async function approveInzetbevestiging(
  factuur: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<{ companyId: string | null; contactId: string | null; dealId: string }> {
  const kenteken = String(factuur.kenteken ?? '').trim();
  if (!kenteken) throw new Error('Kenteken ontbreekt bij inzetbevestiging');

  // Haal gedetailleerde velden op uit extracted_data (volledige InzetdocumentExtract).
  // Kolom-velden overschrijven extracted_data waar aanwezig (kunnen na extractie bijgewerkt zijn).
  const raw = (factuur.extracted_data ?? {}) as Record<string, unknown>;

  const ext: InzetdocumentExtract = {
    kenteken,
    merk_model: (factuur.merk_model ?? raw.merk_model ?? null) as string | null,
    brandstof: (factuur.brandstof ?? raw.brandstof ?? null) as string | null,
    fiscale_waarde: (raw.fiscale_waarde ?? null) as number | null,
    contractnummer: (factuur.contractnummer ?? raw.contractnummer ?? null) as string | null,
    inzetdatum: (factuur.inzetdatum ?? raw.inzetdatum ?? null) as string | null,
    looptijd_maanden: (factuur.looptijd_maanden ?? raw.looptijd_maanden ?? null) as number | null,
    jaarkilometrage: (factuur.jaarkilometrage ?? raw.jaarkilometrage ?? null) as number | null,
    type_aanschaf: (factuur.type_aanschaf ?? raw.type_aanschaf ?? null) as string | null,
    banden: (factuur.banden ?? raw.banden ?? null) as string | null,
    berijder_voornaam: (raw.berijder_voornaam ?? null) as string | null,
    berijder_achternaam: (raw.berijder_achternaam ?? null) as string | null,
    berijder_email: (factuur.berijder_email ?? raw.berijder_email ?? null) as string | null,
    berijder_telefoon: (raw.berijder_telefoon ?? null) as string | null,
    berijder_adres: (raw.berijder_adres ?? null) as string | null,
    berijder_postcode: (raw.berijder_postcode ?? null) as string | null,
    berijder_stad: (raw.berijder_stad ?? null) as string | null,
    bedrijf_naam: (factuur.bedrijfsnaam ?? raw.bedrijf_naam ?? null) as string | null,
    bedrijf_adres: (factuur.straat ?? raw.bedrijf_adres ?? null) as string | null,
    bedrijf_postcode: (factuur.postcode ?? raw.bedrijf_postcode ?? null) as string | null,
    bedrijf_stad: (factuur.plaats ?? raw.bedrijf_stad ?? null) as string | null,
    bedrijf_kvk: (factuur.kvk ?? raw.bedrijf_kvk ?? null) as string | null,
    leasemaatschappij_naam: (factuur.leasemaatschappij ?? raw.leasemaatschappij_naam ?? null) as string | null,
    leasemaatschappij_referentie: (raw.leasemaatschappij_referentie ?? null) as string | null,
    leasemaatschappij_contactpersoon: (raw.leasemaatschappij_contactpersoon ?? null) as string | null,
    leasemaatschappij_email: (raw.leasemaatschappij_email ?? null) as string | null,
    leasemaatschappij_telefoon: (raw.leasemaatschappij_telefoon ?? null) as string | null,
    leverende_dealer: (raw.leverende_dealer ?? null) as string | null,
    leasebedrag_per_maand: (raw.leasebedrag_per_maand ?? null) as number | null,
    verwachte_leverdatum: (raw.verwachte_leverdatum ?? null) as string | null,
  };

  // Download PDF voor bijlage op de deal (best-effort)
  let pdfBuffer: ArrayBuffer | undefined;
  let pdfNaam: string | undefined;
  if (factuur.pdf_storage_path) {
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from('facturen').download(String(factuur.pdf_storage_path));
      if (!dlErr && blob) {
        pdfBuffer = await blob.arrayBuffer();
        pdfNaam = `Inzetbevestiging ${kenteken}.pdf`;
      }
    } catch (e) {
      console.error('inzetbevestiging PDF-download mislukt:', (e as Error).message);
    }
  }

  const result = await koppelInzet(ext, { pdfBuffer, pdfNaam });

  if (!result.dealId) {
    throw new Error(`Geen deal gevonden of aangemaakt voor kenteken ${kenteken}`);
  }

  return {
    companyId: result.companyId,
    contactId: result.contactId,
    dealId: result.dealId,
  };
}
