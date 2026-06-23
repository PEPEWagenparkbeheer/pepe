import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { getStatus } from '@/lib/twinfield/auth';
import { listOffices } from '@/lib/twinfield/soap';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const row = await getStatus();
  if (!row) {
    return NextResponse.json({ connected: false });
  }

  let offices: { code: string; name: string }[] = [];
  try {
    offices = await listOffices();
  } catch {
    // Niet-fataal: koppeling bestaat maar offices ophalen mislukt (bijv. geen company_code).
  }

  return NextResponse.json({
    connected: true,
    connected_by: row.connected_by,
    connected_at: row.connected_at,
    company_code: row.company_code,
    offices,
  });
}
