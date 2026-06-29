// GET /api/uitgaande-facturen/[id]/render — rendert de factuur als PDF (design-getrouw, Chromium).
// Gebruikt voor de PDF-preview in de modal.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { renderFactuurPdf } from '@/lib/factuur/render';
import type { UitgaandeFactuur } from '@/types/factuur';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const { data: f } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

  try {
    const pdf = await renderFactuurPdf(f as UitgaandeFactuur);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="factuur-${(f as UitgaandeFactuur).factuurnummer ?? 'concept'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `PDF renderen mislukt: ${String(e)}` }, { status: 500 });
  }
}
