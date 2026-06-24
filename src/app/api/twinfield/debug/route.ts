import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

// TIJDELIJKE diagnostische route — verifieert of Vercel de juiste env-waarden
// heeft zonder secrets te lekken (alleen lengte + sha256-prefix).
function fingerprint(v: string | undefined): { len: number; sha: string } {
  if (!v) return { len: 0, sha: 'LEEG' };
  return { len: v.length, sha: createHash('sha256').update(v).digest('hex').slice(0, 16) };
}

export async function GET() {
  return NextResponse.json({
    clientId: fingerprint(process.env.TWINFIELD_CLIENT_ID?.trim()),
    clientSecret: fingerprint(process.env.TWINFIELD_CLIENT_SECRET?.trim()),
    redirectUri: fingerprint(process.env.TWINFIELD_REDIRECT_URI?.trim()),
    // ruwe redirect URI is niet geheim — handig om exacte match te checken
    redirectUriRaw: process.env.TWINFIELD_REDIRECT_URI?.trim() ?? 'LEEG',
  });
}
