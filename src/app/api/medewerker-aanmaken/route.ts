import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Standaardwachtwoord voor nieuwe medewerkers. Zij kunnen dit zelf wijzigen
// via Instellingen → "Mijn wachtwoord".
const STANDAARD_WACHTWOORD = 'PEPE2026';

export async function POST(req: NextRequest) {
  // Verifieer dat de aanroeper ingelogd is via Supabase JWT
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

  const { naam } = await req.json().catch(() => ({}));
  if (!naam?.trim()) return NextResponse.json({ error: 'Naam vereist' }, { status: 400 });
  if (naam.trim().length > 100) return NextResponse.json({ error: 'Naam te lang' }, { status: 400 });
  // Voorkom dat een geplakt e-mailadres een verminkte account aanmaakt (bv. "rik@..." -> "rikpepewagenparkbeheernl@...")
  if (naam.includes('@')) {
    return NextResponse.json({ error: 'Vul alleen de voornaam in, geen e-mailadres' }, { status: 400 });
  }

  const voornaam = naam.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!voornaam) return NextResponse.json({ error: 'Ongeldige naam' }, { status: 400 });

  const email = `${voornaam}@pepewagenparkbeheer.nl`;
  const metadata = { naam: naam.trim() };

  // Maak account aan met standaardwachtwoord, direct inlogbaar (geen e-mailbevestiging nodig)
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: STANDAARD_WACHTWOORD,
    email_confirm: true,
    user_metadata: metadata,
  });

  let bestaatAl = false;
  if (createError) {
    bestaatAl = createError.message.toLowerCase().includes('already') ||
                createError.message.toLowerCase().includes('exists') ||
                createError.message.toLowerCase().includes('registered');
    if (!bestaatAl) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // Bestaat al — wachtwoord resetten naar standaard (handig als iemand het kwijt is)
    const { data: lijst } = await supabaseAdmin.auth.admin.listUsers();
    const bestaande = lijst?.users.find((u) => u.email === email);
    if (bestaande) {
      await supabaseAdmin.auth.admin.updateUserById(bestaande.id, {
        password: STANDAARD_WACHTWOORD,
        user_metadata: metadata,
      });
    }
  }

  // Medewerker in de lijst zetten/bijwerken
  const { error: dbError } = await supabaseAdmin
    .from('medewerkers')
    .upsert({ naam: naam.trim(), email, actief: true }, { onConflict: 'email' });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, bestaatAl, wachtwoord: STANDAARD_WACHTWOORD });
}
