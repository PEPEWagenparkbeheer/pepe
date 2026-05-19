import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

  const { naam, wie, email: opgegeven_email } = await req.json().catch(() => ({}));
  if (!naam?.trim()) return NextResponse.json({ error: 'Naam vereist' }, { status: 400 });
  if (!wie?.trim())  return NextResponse.json({ error: 'Wie-koppeling vereist' }, { status: 400 });

  const voornaam = naam.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!voornaam) return NextResponse.json({ error: 'Ongeldige naam' }, { status: 400 });

  const email = opgegeven_email?.trim() || `${voornaam}@pepewagenparkbeheer.nl`;

  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { naam: naam.trim(), rol: 'partner', wie: wie.trim().toUpperCase() },
  });

  const bestaatAl = !!inviteError && inviteError.message.toLowerCase().includes('already');
  if (inviteError && !bestaatAl) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, bestaatAl });
}
