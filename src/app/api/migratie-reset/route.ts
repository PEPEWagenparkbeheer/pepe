import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Missende env vars' }, { status: 500 });

  const admin = createClient(url, key);

  await admin.from('zoekopdrachten').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('after_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('as_klachten').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('lease_aanvragen').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  return NextResponse.json({ ok: true });
}
