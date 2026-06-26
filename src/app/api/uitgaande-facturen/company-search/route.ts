// GET /api/uitgaande-facturen/company-search?q=  — live bedrijf-zoeken (autocomplete)
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { searchCompaniesByNameLike } from '@/lib/hubspot';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const resultaten = await searchCompaniesByNameLike(q);
  return NextResponse.json({ resultaten });
}
