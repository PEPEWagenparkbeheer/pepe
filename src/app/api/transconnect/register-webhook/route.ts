import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { registerWebhook } from '@/lib/transconnect';

// POST /api/transconnect/register-webhook
// Eenmalig uitvoeren om de TC webhook te activeren.
// Vereist een ingelogde gebruiker (Authorization header).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const caller = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const host = req.headers.get('host') ?? '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const callbackUrl = `${protocol}://${host}/api/transconnect/webhook`;

  try {
    await registerWebhook(callbackUrl);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, callbackUrl });
}
