// GET /api/uitgaande-facturen/company-children?parentId=  — dochters + aantal rijdende voertuigen
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { getChildCompanies, getRijdendeDealsForCompany } from '@/lib/hubspot';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const parentId = new URL(req.url).searchParams.get('parentId') ?? '';
  if (!parentId) return NextResponse.json({ dochters: [] });

  const childs = await getChildCompanies(parentId);
  const dochters = await Promise.all(
    childs.map(async (c) => {
      const { aantal } = await getRijdendeDealsForCompany(c.id);
      return { hubspot_company_id: c.id, naam: c.naam, aantal };
    }),
  );
  return NextResponse.json({ dochters });
}
