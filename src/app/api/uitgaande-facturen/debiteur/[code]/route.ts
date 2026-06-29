// GET /api/uitgaande-facturen/debiteur/[code] — NAW van een Twinfield-debiteur (voor autofill).
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { readDebiteur } from '@/lib/twinfield/factuur';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { code } = await ctx.params;
  try {
    const debiteur = await readDebiteur(code);
    return NextResponse.json({ debiteur });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
