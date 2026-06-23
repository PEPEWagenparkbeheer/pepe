import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { exchangeCode, resolveCluster, storeTokens } from '@/lib/twinfield/auth';

export const runtime = 'nodejs';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flow.pepewagenparkbeheer.nl';

export async function GET(req: NextRequest) {
  // Twinfield stuurt een browser-redirect, geen Bearer token. Toch vereisen we dat de
  // gebruiker al een geldige PEPE-sessie heeft (cookie-gebaseerd) zodat we weten wie koppelde.
  const gate = await requirePepe(req);
  if (!gate.ok) return NextResponse.redirect(`${BASE}/instellingen?twinfield=fout&reden=niet-ingelogd`);

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${BASE}/instellingen?twinfield=fout&reden=${encodeURIComponent(error ?? 'geen-code')}`);
  }

  // CSRF: controleer state-cookie
  const storedState = req.cookies.get('tf_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${BASE}/instellingen?twinfield=fout&reden=state-mismatch`);
  }

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCode(code);
    const clusterUrl = await resolveCluster(accessToken);
    await storeTokens({
      accessToken,
      refreshToken,
      expiresIn,
      clusterUrl,
      connectedBy: gate.user.email ?? gate.user.id,
    });
  } catch (err) {
    console.error('[twinfield/callback]', err);
    const reden = err instanceof Error ? err.message : 'onbekend';
    return NextResponse.redirect(`${BASE}/instellingen?twinfield=fout&reden=${encodeURIComponent(reden)}`);
  }

  const res = NextResponse.redirect(`${BASE}/instellingen?twinfield=ok`);
  res.cookies.delete('tf_state');
  return res;
}
