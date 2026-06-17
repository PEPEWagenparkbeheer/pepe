// Gedeelde server-side auth-helpers voor API-routes.
//
// Veel routes draaien op de SERVICE_ROLE-sleutel (supabaseAdmin), die ÁLLE Row Level
// Security omzeilt. Zulke routes MOETEN zelf autoriseren. Gebruik:
//
//   const gate = await requirePepe(req);
//   if (!gate.ok) return gate.response;
//   const { user } = gate;
//
// requireUser  → elke ingelogde Supabase-gebruiker (partner of medewerker).
// requirePepe  → alleen PEPE-medewerkers (@pepewagenparkbeheer.nl of in `medewerkers`-tabel).

import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Gate =
  | { ok: true; user: User; token: string }
  | { ok: false; response: NextResponse };

function unauthorized(msg = 'Niet ingelogd'): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: msg }, { status: 401 }) };
}

function forbidden(msg = 'Geen toegang'): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: msg }, { status: 403 }) };
}

/** Valideer het Bearer-token en geef de ingelogde gebruiker terug. */
export async function requireUser(req: Request): Promise<Gate> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return unauthorized();

  const caller = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return unauthorized();

  return { ok: true, user, token };
}

/**
 * True als dit account een (actieve) PEPE-medewerker is.
 * NB: NIET op e-maildomein — sommige partners hebben ook een @pepewagenparkbeheer.nl
 * adres (bv. robin@, kurdo@). De `medewerkers`-tabel is de bron van waarheid.
 */
export async function isPepeUser(user: User): Promise<boolean> {
  if ((user.user_metadata as { rol?: string } | null)?.rol === 'partner') return false;

  const email = (user.email ?? '').toLowerCase();
  if (!email) return false;

  // supabaseAdmin omzeilt RLS, dus deze lookup werkt ook met strenge policies.
  const { data } = await supabaseAdmin
    .from('medewerkers')
    .select('email, actief')
    .ilike('email', email)
    .maybeSingle();

  return !!data && data.actief !== false;
}

/** Valideer het token én eis dat de aanroeper een PEPE-medewerker is. */
export async function requirePepe(req: Request): Promise<Gate> {
  const gate = await requireUser(req);
  if (!gate.ok) return gate;
  if (!(await isPepeUser(gate.user))) return forbidden('Alleen voor PEPE-medewerkers');
  return gate;
}
