'use client';

import { supabase } from '@/lib/supabase';

// Geeft de Authorization-header met het huidige Supabase-sessietoken.
// Gebruik dit bij fetch() naar beveiligde /api-routes zodat de server de
// ingelogde gebruiker kan verifiëren (zie src/lib/apiAuth.ts).
//
//   const res = await fetch('/api/...', { method: 'POST', headers: await authHeaders() });
export async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}
