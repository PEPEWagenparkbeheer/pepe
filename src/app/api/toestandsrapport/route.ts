import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requirePepe } from '@/lib/apiAuth';
import { analyseerToestandsrapport } from '@/lib/toestandsrapport/analyse';

export const runtime = 'nodejs';
export const maxDuration = 60;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// POST /api/toestandsrapport — upload PDF, analyseer, sla op
export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ongeldige form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Geen PDF ontvangen' }, { status: 400 });
  }

  const bestandsnaam = file instanceof File ? file.name : 'rapport.pdf';
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64Pdf = buffer.toString('base64');

  // Upload naar storage
  const admin = adminClient();
  const datumPrefix = new Date().toISOString().slice(0, 10);
  const storagePath = `${datumPrefix}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await admin.storage
    .from('toestandsrapporten')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload fout:', uploadError);
    return NextResponse.json({ error: 'Upload mislukt' }, { status: 500 });
  }

  // AI-analyse
  let analyse;
  try {
    analyse = await analyseerToestandsrapport(base64Pdf);
  } catch (err) {
    console.error('AI analyse fout:', err);
    return NextResponse.json({ error: 'Analyse mislukt' }, { status: 500 });
  }

  // Opslaan in database
  const { data, error: dbError } = await admin
    .from('toestandsrapporten')
    .insert({
      bestandsnaam,
      pdf_storage_path: storagePath,
      merk: analyse.merk ?? null,
      model: analyse.model ?? null,
      kenteken: analyse.kenteken ?? null,
      km_stand: analyse.km_stand ?? null,
      conclusie: analyse.conclusie ?? null,
      bijzonderheden: analyse.bijzonderheden,
      ruwe_analyse: analyse,
      door: gate.user.email ?? gate.user.id,
    })
    .select()
    .single();

  if (dbError) {
    console.error('DB insert fout:', dbError);
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 });
  }

  return NextResponse.json(data);
}

// GET /api/toestandsrapport — haal laatste 50 rapporten op
export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const admin = adminClient();
  const { data, error } = await admin
    .from('toestandsrapporten')
    .select('id, created_at, bestandsnaam, merk, model, kenteken, km_stand, conclusie, bijzonderheden, door')
    .eq('gearchiveerd', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
