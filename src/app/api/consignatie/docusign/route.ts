import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

// DocuSign via directe REST API + JWT (Node crypto). Bewust GEEN docusign-esign SDK:
// dat pakket gebruikt AMD define()-modules die Turbopack (Next 16) niet kan bundelen.

// Var-namen identiek aan de wpb-klantportal zodat beide apps dezelfde DocuSign-config
// delen. Private key staat base64-encoded (single-line, geen multiline-gedoe in Vercel).
// .trim() op alles: env-waarden kunnen een trailing newline/space hebben (bv. via
// `vercel env add` met piped stdin) → anders 'issuer_not_found' op de iss-claim.
const OAUTH_BASE = (process.env.DOCUSIGN_OAUTH_BASE ?? 'account.docusign.com').trim();
// BASE_URI zónder /restapi (zoals wpb het opslaat); /restapi wordt in de URL geplakt.
const BASE_URL = (process.env.DOCUSIGN_BASE_URI ?? 'https://eu.docusign.net').trim();
const INTEGRATION_KEY = (process.env.DOCUSIGN_INTEGRATION_KEY ?? '').trim();
const USER_ID = (process.env.DOCUSIGN_USER_ID ?? '').trim();
const PRIVATE_KEY_B64 = (process.env.DOCUSIGN_PRIVATE_KEY_B64 ?? '').trim();
const ACCOUNT_ID = (process.env.DOCUSIGN_ACCOUNT_ID ?? '').trim();

function stripDataUri(value: string) {
  const prefix = 'data:application/pdf;base64,';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createAccessToken(): Promise<string> {
  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY_B64 || !ACCOUNT_ID) {
    throw new Error('DocuSign is niet geconfigureerd. Controleer de omgevingsvariabelen.');
  }

  const privateKey = Buffer.from(PRIVATE_KEY_B64, 'base64').toString('utf-8');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: INTEGRATION_KEY,
    sub: USER_ID,
    aud: OAUTH_BASE,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(`https://${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DocuSign OAuth mislukt (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Geen DocuSign access token ontvangen.');
  }
  return data.access_token;
}

// Health-check: probeert een JWT-token te halen. Geen secrets in de respons.
// GET /api/consignatie/docusign → { ok, oauthBase } of { ok:false, error }.
export async function GET() {
  try {
    await createAccessToken();
    return NextResponse.json({ ok: true, oauthBase: OAUTH_BASE, baseUrl: BASE_URL });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, oauthBase: OAUTH_BASE, baseUrl: BASE_URL, error: message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const {
      pdfBase64,
      auto,
      klantNaam,
      emailKlant,
      emailInkoper,
      documentNaam,
      onderwerp,
      bericht,
    } = body;

    if (typeof pdfBase64 !== 'string' || !pdfBase64.trim()) {
      return NextResponse.json({ error: 'PDF ontbreekt.' }, { status: 400 });
    }
    if (typeof emailKlant !== 'string' || !emailKlant.trim()) {
      return NextResponse.json({ error: 'E-mail klant ontbreekt.' }, { status: 400 });
    }
    if (typeof emailInkoper !== 'string' || !emailInkoper.trim()) {
      return NextResponse.json({ error: 'E-mail inkoper ontbreekt.' }, { status: 400 });
    }

    const accessToken = await createAccessToken();

    const documentNaamFinal =
      typeof documentNaam === 'string' && documentNaam.trim()
        ? documentNaam
        : `Inkoopfactuur ${auto ?? ''}`.trim() || 'Inkoopfactuur';

    const envelopeDefinition = {
      emailSubject:
        typeof onderwerp === 'string' && onderwerp.trim()
          ? onderwerp
          : `Inkoopfactuur ${auto ?? ''}`.trim() || 'Inkoopfactuur',
      emailBlurb:
        typeof bericht === 'string' && bericht.trim()
          ? bericht
          : 'Onderteken deze inkoopfactuur digitaal via DocuSign.',
      status: 'sent',
      documents: [
        {
          documentBase64: stripDataUri(pdfBase64),
          name: documentNaamFinal,
          fileExtension: 'pdf',
          documentId: '1',
        },
      ],
      recipients: {
        signers: [
          {
            email: emailKlant,
            name: typeof klantNaam === 'string' && klantNaam.trim() ? klantNaam : 'Klant',
            recipientId: '1',
            routingOrder: '1',
            tabs: {
              signHereTabs: [
                { documentId: '1', pageNumber: '1', xPosition: '40', yPosition: '220' },
              ],
            },
          },
          {
            email: emailInkoper,
            name: 'Inkoper',
            recipientId: '2',
            routingOrder: '2',
            tabs: {
              signHereTabs: [
                { documentId: '1', pageNumber: '1', xPosition: '40', yPosition: '255' },
              ],
            },
          },
        ],
      },
    };

    const res = await fetch(`${BASE_URL}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...envelopeDefinition }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DocuSign envelope mislukt (${res.status}): ${text}`);
    }

    const result = (await res.json()) as { envelopeId?: string; status?: string };
    return NextResponse.json({ ok: true, envelopeId: result.envelopeId, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    console.error('[consignatie/docusign] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
