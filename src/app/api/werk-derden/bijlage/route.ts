// POST /api/werk-derden/bijlage
// Accepteert multipart form met veld 'file' (PDF / afbeelding) en 'kenteken'.
// Slaat op in Supabase Storage bucket 'werk-derden' en geeft het pad terug.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ongeldige form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });
  }

  const kenteken = (formData.get('kenteken') as string | null)?.replace(/[^A-Z0-9]/gi, '') ?? 'onbekend';
  const originalName = file instanceof File ? file.name : 'bijlage';
  const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
  const datumPrefix = new Date().toISOString().slice(0, 10);
  const storagePath = `${datumPrefix}/${kenteken}-${crypto.randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from('werk-derden')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    console.error('werk-derden bijlage upload fout:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path: storagePath });
}
