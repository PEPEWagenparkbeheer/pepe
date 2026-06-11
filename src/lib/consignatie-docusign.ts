// Gedeelde DocuSign-helpers voor de consignatie/inkoopverklaring (server-only).
// JWT-grant via Node crypto, identiek aan de wpb-klantportal. .trim() op alle
// env-waarden (anders 'issuer_not_found' bij een trailing newline).

import crypto from 'node:crypto';

const OAUTH_BASE = (process.env.DOCUSIGN_OAUTH_BASE ?? 'account.docusign.com').trim();
// BASE_URI zónder /restapi; dat wordt in de URL geplakt.
export const DOCUSIGN_BASE = (process.env.DOCUSIGN_BASE_URI ?? 'https://eu.docusign.net').trim();
export const DOCUSIGN_ACCOUNT = (process.env.DOCUSIGN_ACCOUNT_ID ?? '').trim();
const INTEGRATION_KEY = (process.env.DOCUSIGN_INTEGRATION_KEY ?? '').trim();
const USER_ID = (process.env.DOCUSIGN_USER_ID ?? '').trim();
const PRIVATE_KEY_B64 = (process.env.DOCUSIGN_PRIVATE_KEY_B64 ?? '').trim();

// E-mail van de boekhouding (Basecone) — ontvangt automatisch de getekende verklaring.
export const BOEKHOUDER_EMAIL = 'vgfd.202500006@mailtobasecone.com';

export const DOCUSIGN_OAUTH = OAUTH_BASE;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getAccessToken(): Promise<string> {
  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY_B64 || !DOCUSIGN_ACCOUNT) {
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
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
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
  if (!data.access_token) throw new Error('Geen DocuSign access token ontvangen.');
  return data.access_token;
}

export interface EnvelopeStatus {
  status: string;            // sent | delivered | completed | declined | voided
  completedDateTime?: string;
  sentDateTime?: string;
}

export async function getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus> {
  const token = await getAccessToken();
  const res = await fetch(
    `${DOCUSIGN_BASE}/restapi/v2.1/accounts/${DOCUSIGN_ACCOUNT}/envelopes/${envelopeId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = (await res.json()) as { status?: string; completedDateTime?: string; sentDateTime?: string };
  if (!res.ok) throw new Error(`DocuSign status mislukt (${res.status})`);
  return { status: j.status ?? 'unknown', completedDateTime: j.completedDateTime, sentDateTime: j.sentDateTime };
}
