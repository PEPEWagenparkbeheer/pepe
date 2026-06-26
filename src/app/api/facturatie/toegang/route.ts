// GET /api/facturatie/toegang — { allowed: boolean }
// Vertelt de client of de ingelogde medewerker de Facturatie-module mag openen.
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe, magFacturatie } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return NextResponse.json({ allowed: false });
  const allowed = await magFacturatie(gate.user);
  return NextResponse.json({ allowed });
}
