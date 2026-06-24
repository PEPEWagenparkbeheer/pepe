import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { buildAuthorizeUrl } from '@/lib/twinfield/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const url = buildAuthorizeUrl(state, nonce);

  const res = NextResponse.json({ url });
  res.cookies.set('tf_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
