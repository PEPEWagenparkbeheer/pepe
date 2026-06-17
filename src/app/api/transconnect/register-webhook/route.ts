import { NextRequest, NextResponse } from 'next/server';
import { registerWebhook } from '@/lib/transconnect';
import { requirePepe } from '@/lib/apiAuth';

// POST /api/transconnect/register-webhook
// Eenmalig uitvoeren om de TC webhook te activeren. Alleen PEPE-medewerkers.
// Als TRANSCONNECT_WEBHOOK_SECRET is gezet, wordt die in de callback-URL gebakken
// zodat de webhook-route de inkomende calls kan verifiëren.
export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const host = req.headers.get('host') ?? '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const secret = process.env.TRANSCONNECT_WEBHOOK_SECRET ?? '';
  const callbackUrl =
    `${protocol}://${host}/api/transconnect/webhook` +
    (secret ? `?secret=${encodeURIComponent(secret)}` : '');

  try {
    await registerWebhook(callbackUrl);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, callbackUrl });
}
