import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';

// Dit endpoint wist alle productiedata. Dubbel beveiligd: vereist een ingelogde
// PEPE-medewerker ÉN de RESET_SECRET env var. Zet RESET_SECRET NIET in de Vercel
// productie-omgeving — dan is het endpoint sowieso dood.
export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const secret = process.env.RESET_SECRET;
  if (!secret) return NextResponse.json({ error: 'Niet beschikbaar in productie' }, { status: 403 });

  const { token } = await req.json().catch(() => ({}));
  if (token !== secret) return NextResponse.json({ error: 'Ongeldig token' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Missende env vars' }, { status: 500 });

  const admin = createClient(url, key);

  await admin.from('as_klachten').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('after_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('zoekopdrachten').delete().gte('id', 0);
  await admin.from('lease_aanvragen').delete().gte('id', 0);

  return NextResponse.json({ ok: true });
}
