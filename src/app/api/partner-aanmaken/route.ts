import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requirePepe } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
  // Alleen een PEPE-medewerker mag partner-accounts aanmaken.
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { naam, wie, email: opgegeven_email, wachtwoord } = await req.json().catch(() => ({}));
  if (!naam?.trim())      return NextResponse.json({ error: 'Naam vereist' }, { status: 400 });
  if (!wie?.trim())       return NextResponse.json({ error: 'Wie-koppeling vereist' }, { status: 400 });
  if (!wachtwoord?.trim()) return NextResponse.json({ error: 'Wachtwoord vereist' }, { status: 400 });

  const voornaam = naam.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!voornaam) return NextResponse.json({ error: 'Ongeldige naam' }, { status: 400 });

  const email = opgegeven_email?.trim() || `${voornaam}@pepewagenparkbeheer.nl`;
  const metadata = { naam: naam.trim(), rol: 'partner', wie: wie.trim().toUpperCase() };

  // Probeer nieuw account aan te maken
  const { data: nieuw, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: wachtwoord.trim(),
    email_confirm: true,
    user_metadata: metadata,
  });

  if (!createError) {
    return NextResponse.json({ ok: true, email, bestaatAl: false });
  }

  // Bestaat al — wachtwoord + metadata bijwerken
  const bestaatAl = createError.message.toLowerCase().includes('already') ||
                    createError.message.toLowerCase().includes('exists');
  if (!bestaatAl) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  const { data: lijst } = await supabaseAdmin.auth.admin.listUsers();
  const bestaande = lijst?.users.find((u) => u.email === email);
  if (!bestaande) {
    return NextResponse.json({ error: 'Gebruiker bestaat al maar kon niet gevonden worden' }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(bestaande.id, {
    password: wachtwoord.trim(),
    user_metadata: metadata,
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, bestaatAl: true });
}
