import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, resolveCluster, storeTokens } from '@/lib/twinfield/auth';

export const runtime = 'nodejs';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flow.pepewagenparkbeheer.nl';

function getConnectedBy(req: NextRequest): string {
  // Best-effort: lees e-mail uit Supabase session-cookie
  try {
    for (const [name, cookie] of req.cookies) {
      if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
        const data = JSON.parse(decodeURIComponent(cookie.value));
        const email = data?.user?.email ?? data?.[0]?.user?.email;
        if (email) return email;
      }
    }
  } catch { /* geen sessie-cookie beschikbaar */ }
  return 'via-oauth';
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${BASE}/instellingen?twinfield=fout&reden=${encodeURIComponent(error ?? 'geen-code')}`);
  }

  // CSRF: controleer state-cookie — dit is de echte beveiliging
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
      connectedBy: getConnectedBy(req),
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
