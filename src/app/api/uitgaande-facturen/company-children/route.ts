// GET /api/uitgaande-facturen/company-children?parentId=  — entiteiten + aantal rijdende voertuigen.
// De MOEDER zelf is óók een factureerbare entiteit: voertuigen hangen vaak direct op de moeder
// (bedrijf zonder dochters). Daarom nemen we de moeder mee naast de HubSpot-dochters.
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { getChildCompanies, getCompanyFields, verdeelWagenparkVoertuigen } from '@/lib/hubspot';

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
  const kindIds = childs.filter((c) => c.id !== parentId).map((c) => c.id);
  // Verdeel de voertuigen zonder dubbeltelling: dochter houdt eigen auto's, moeder alleen de rest.
  const verdeling = await verdeelWagenparkVoertuigen(parentId, kindIds);
  // Moeder eerst als "(hoofd)"-entiteit, daarna dochters.
  const entiteiten = [
    { id: parentId, naam: `${parentNaam ?? 'Moedermaatschappij'} (hoofd)` },
    ...childs.filter((c) => c.id !== parentId),
  ];
  const dochters = entiteiten.map((c) => ({
    hubspot_company_id: c.id,
    naam: c.naam,
    aantal: verdeling[c.id]?.aantal ?? 0,
  }));
  return NextResponse.json({ dochters });
}
