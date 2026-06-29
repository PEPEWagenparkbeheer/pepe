// GET /api/uitgaande-facturen/[id]/pdf — geeft een tijdelijke signed URL van de factuur-PDF ({url}).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const { data: f } = await supabaseAdmin
    .from('uitgaande_facturen').select('pdf_storage_path').eq('id', id).maybeSingle();
  if (!f?.pdf_storage_path) return NextResponse.json({ error: 'Geen PDF opgeslagen' }, { status: 404 });

  const { data, error } = await supabaseAdmin.storage
    .from('uitgaande-facturen')
    .createSignedUrl(f.pdf_storage_path, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'PDF-link maken mislukt' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
