// Synct een AUTO-verkoopfactuur naar HubSpot — zelfde gedrag als documentenstroom:
// deal matchen/aanmaken/overschrijven op kenteken, op RIJDEND zetten en RDW-velden vullen
// (merk/type, brandstof, APK, fiscale waarde, km, inzetdatum). Alleen voor type 'auto'.
import { rdwOpzoeken } from '../rdw';
import {
  searchDealByKenteken, createDeal, updateDealFields, associateDealCompany,
  findCompany, createCompany, searchCompanyByKvk, getCompanyFields, DEALSTAGE_RIJDEND,
} from '../hubspot';
import type { UitgaandeFactuur } from '@/types/factuur';

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

export interface AutoSyncResult { dealId?: string; companyId?: string | null; skipped?: boolean; reden?: string }

export async function syncAutoFactuurNaarHubSpot(factuur: UitgaandeFactuur): Promise<AutoSyncResult> {
  if (factuur.type !== 'auto') return { skipped: true, reden: 'geen auto' };
  const v = factuur.voertuig;
  const kenteken = (v?.kenteken ?? '').replace(/\s+/g, '').toUpperCase();
  if (!kenteken) return { skipped: true, reden: 'geen kenteken' };

  const rdw = await rdwOpzoeken(kenteken).catch(() => null);

  // Bedrijf: gekoppelde company, anders zoeken/aanmaken (match-first, geen dubbele).
  let companyId: string | null = factuur.hubspot_company_id ?? null;
  if (companyId) {
    // zorg dat de company nog bestaat; anders opnieuw zoeken
    const ok = await getCompanyFields(companyId, ['name']).then((f) => !!f).catch(() => false);
    if (!ok) companyId = null;
  }
  if (!companyId && factuur.kvk) companyId = await searchCompanyByKvk(factuur.kvk.replace(/\D/g, '')).catch(() => null);
  if (!companyId && factuur.klant_naam) {
    companyId = await findCompany({
      name: factuur.klant_naam, postcode: factuur.postcode, plaats: factuur.plaats, adres: factuur.adres,
    }).catch(() => null);
  }
  if (!companyId && factuur.klant_naam) {
    companyId = await createCompany({
      name: factuur.klant_naam,
      kvk: factuur.kvk ? factuur.kvk.replace(/\D/g, '') : undefined,
      address: factuur.adres ?? undefined, zip: factuur.postcode ?? undefined,
      city: factuur.plaats ?? undefined, country: 'NL',
    }).catch(() => null);
  }

  // RDW APK dd-mm-yyyy → ISO yyyy-mm-dd
  let apkIso: string | undefined;
  if (rdw?.apkDatum) { const [d, m, y] = rdw.apkDatum.split('-'); if (d && m && y) apkIso = `${y}-${m}-${d}`; }

  const merkType = [v?.merk, v?.model].filter(Boolean).join(' ')
    || (rdw ? `${rdw.voertuig.merk ?? ''} ${rdw.voertuig.handelsbenaming ?? ''}`.trim() : '');
  const fiscale = rdw?.catalogusprijs ?? undefined;
  const brandstof = mapBrandstof(rdw?.brandstof);
  const km = v?.km_stand ?? undefined;
  const inzet = factuur.factuurdatum ?? new Date().toISOString().slice(0, 10);

  let dealId = await searchDealByKenteken(kenteken);
  if (dealId) {
    const props: Record<string, string> = { dealstage: DEALSTAGE_RIJDEND, dealname: kenteken, type_aanschaf: 'Aanschaf' };
    if (merkType) props.merk___type = merkType;
    if (brandstof) props.brandstof = brandstof;
    if (apkIso) props.apk_datum = apkIso;
    if (fiscale != null) props.fiscale_waarde = String(fiscale);
    if (km != null) props.kilometerstand_huidig = String(km);
    if (inzet) props.inzetdatum = inzet;
    await updateDealFields(dealId, props);
  } else {
    dealId = await createDeal({
      kenteken, merk_type: merkType || undefined, brandstof, apk_datum: apkIso,
      fiscale_waarde: fiscale, kilometerstand_huidig: km, type_aanschaf: 'Aanschaf',
      leverancier: 'PEPE Wagenparkbeheer', inzetdatum: inzet, land_kenteken: 'NL',
      dealstage: DEALSTAGE_RIJDEND,
    });
  }
  if (companyId) await associateDealCompany(dealId, companyId).catch(() => {});
  return { dealId, companyId };
}
