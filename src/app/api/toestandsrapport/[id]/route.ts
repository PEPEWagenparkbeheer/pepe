import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// DELETE /api/toestandsrapport/[id] -- soft-delete (gearchiveerd=true)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { id } = await params;

  const admin = adminClient();
  const { error } = await admin
    .from('toestandsrapporten')
    .update({ gearchiveerd: true })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}