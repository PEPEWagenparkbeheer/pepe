// GET /api/uitgaande-facturen/klant-lookup?kvk=  | ?naam=  | ?kenteken=
// Haalt NAW van de debiteur uit HubSpot voor het "Factuur aan"-blok.
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import {
  searchCompanyByKvk,
  searchCompanyByName,
  getCompanyFields,
  getInkoopNawByKenteken,
} from '@/lib/hubspot';

export const runtime = 'nodejs';

const COMPANY_PROPS = [
  'name', 'address', 'zip', 'city', 'phone', 'kvk_nummer', 'twinfield_debiteur_code',
];

async function companyNaw(companyId: string) {
  const f = await getCompanyFields(companyId, COMPANY_PROPS);
  return {
    hubspot_company_id: companyId,
    klant_naam: (f?.name as string) ?? null,
    adres: (f?.address as string) ?? null,
    postcode: (f?.zip as string) ?? null,
    plaats: (f?.city as string) ?? null,
    telefoon: (f?.phone as string) ?? null,
    kvk: (f?.kvk_nummer as string) ?? null,
    twinfield_debiteur_code: (f?.twinfield_debiteur_code as string) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const kvk = url.searchParams.get('kvk');
  const naam = url.searchParams.get('naam');
  const kenteken = url.searchParams.get('kenteken');

  try {
    if (kvk) {
      const id = await searchCompanyByKvk(kvk.replace(/\D/g, ''));
      if (id) return NextResponse.json({ gevonden: true, ...(await companyNaw(id)) });
    }
    if (naam) {
      const id = await searchCompanyByName(naam);
      if (id) return NextResponse.json({ gevonden: true, ...(await companyNaw(id)) });
    }
    if (kenteken) {
      const naw = await getInkoopNawByKenteken(kenteken);
      if (naw?.gevonden) {
        return NextResponse.json({
          gevonden: true,
          klant_naam: naw.naam ?? null,
          adres: naw.straat ?? null,
          postcode: naw.postcode ?? null,
          plaats: naw.plaats ?? null,
          telefoon: naw.telefoon ?? null,
          email: naw.email ?? null,
        });
      }
    }
    return NextResponse.json({ gevonden: false });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
