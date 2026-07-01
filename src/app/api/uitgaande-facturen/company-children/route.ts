// GET /api/uitgaande-facturen/company-children?parentId=  — entiteiten + aantal rijdende voertuigen.
// De MOEDER zelf is óók een factureerbare entiteit: voertuigen hangen vaak direct op de moeder
// (bedrijf zonder dochters). Daarom nemen we de moeder mee naast de HubSpot-dochters.
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { getChildCompanies, getRijdendeDealsForCompany, getCompanyFields } from '@/lib/hubspot';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const parentId = new URL(req.url).searchParams.get('parentId') ?? '';
  if (!parentId) return NextResponse.json({ dochters: [] });

  const [parentNaam, childs] = await Promise.all([
    getCompanyFields(parentId, ['name']).then((f) => (f.name as string) || null).catch(() => null),
    getChildCompanies(parentId),
  ]);
  // Moeder eerst, daarna dochters — dedup op id (moeder niet dubbel als ze ook als child terugkomt).
  const entiteiten = [
    { id: parentId, naam: `${parentNaam ?? 'Moedermaatschappij'} (hoofd)` },
    ...childs.filter((c) => c.id !== parentId),
  ];
  const dochters = await Promise.all(
    entiteiten.map(async (c) => {
      const { aantal } = await getRijdendeDealsForCompany(c.id);
      return { hubspot_company_id: c.id, naam: c.naam, aantal };
    }),
  );
  return NextResponse.json({ dochters });
}
