import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const { naam } = await req.json();
  if (!naam?.trim()) return NextResponse.json({ error: 'Naam vereist' }, { status: 400 });

  const voornaam = naam.trim().split(/\s+/)[0].toLowerCase();
  const email = `${voornaam}@pepewagenparkbeheer.nl`;

  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { naam: naam.trim() },
  });

  const bestaatAl = !!inviteError && inviteError.message.toLowerCase().includes('already');

  if (inviteError && !bestaatAl) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('medewerkers')
    .upsert({ naam: naam.trim(), email, actief: true }, { onConflict: 'email' });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    email,
    bestaatAl,
  });
}
