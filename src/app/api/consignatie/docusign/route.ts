import { NextRequest, NextResponse } from 'next/server';
import docusign from 'docusign-esign';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DOCUSIGN_OAUTH_BASE_PATH = process.env.DOCUSIGN_OAUTH_BASE_PATH ?? 'account-d.docusign.com';
const DOCUSIGN_BASE_URL = process.env.DOCUSIGN_BASE_URL ?? 'https://demo.docusign.net/restapi';
const DOCUSIGN_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY ?? '';
const DOCUSIGN_USER_ID = process.env.DOCUSIGN_USER_ID ?? '';
const DOCUSIGN_PRIVATE_KEY = process.env.DOCUSIGN_PRIVATE_KEY ?? '';
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID ?? '';

function invalidEnv(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\r/g, '\n').replace(/\\n/g, '\n');
}

function stripDataUri(value: string) {
  const prefix = 'data:application/pdf;base64,';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

async function createAccessToken() {
  if (!DOCUSIGN_INTEGRATION_KEY || !DOCUSIGN_USER_ID || !DOCUSIGN_PRIVATE_KEY || !DOCUSIGN_ACCOUNT_ID) {
    throw new Error('DocuSign is niet geconfigureerd. Controleer de omgevingsvariabelen.');
  }

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(DOCUSIGN_OAUTH_BASE_PATH);
  apiClient.setBasePath(DOCUSIGN_BASE_URL);

  const privateKey = Buffer.from(normalizePrivateKey(DOCUSIGN_PRIVATE_KEY), 'utf-8');
  const tokenResponse = await apiClient.requestJWTUserToken(
    DOCUSIGN_INTEGRATION_KEY,
    DOCUSIGN_USER_ID,
    ['signature'],
    privateKey,
    3600,
  );

  const accessToken = tokenResponse.body?.access_token;
  if (!accessToken) {
    throw new Error('Geen DocuSign access token ontvangen.');
  }

  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  return apiClient;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pdfBase64,
      auto,
      kenteken,
      klantNaam,
      emailKlant,
      emailInkoper,
      documentNaam,
      onderwerp,
      bericht,
    } = body as Record<string, unknown>;

    if (typeof pdfBase64 !== 'string' || !pdfBase64.trim()) {
      return NextResponse.json({ error: 'PDF ontbreekt.' }, { status: 400 });
    }
    if (typeof emailKlant !== 'string' || !emailKlant.trim()) {
      return NextResponse.json({ error: 'E-mail klant ontbreekt.' }, { status: 400 });
    }
    if (typeof emailInkoper !== 'string' || !emailInkoper.trim()) {
      return NextResponse.json({ error: 'E-mail inkoper ontbreekt.' }, { status: 400 });
    }

    const client = await createAccessToken();
    const envelopesApi = new docusign.EnvelopesApi(client);

    const document = new docusign.Document();
    document.documentBase64 = stripDataUri(pdfBase64);
    document.name = typeof documentNaam === 'string' && documentNaam.trim()
      ? documentNaam
      : `Inkoopfactuur ${auto ?? ''}`.trim() || 'Inkoopfactuur';
    document.fileExtension = 'pdf';
    document.documentId = '1';

    const klantSigner = new docusign.Signer();
    klantSigner.email = emailKlant;
    klantSigner.name = typeof klantNaam === 'string' && klantNaam.trim() ? klantNaam : 'Klant';
    klantSigner.recipientId = '1';
    klantSigner.routingOrder = '1';
    klantSigner.tabs = new docusign.Tabs();
    const klantSignHere = new docusign.SignHere();
    klantSignHere.documentId = '1';
    klantSignHere.pageNumber = '1';
    klantSignHere.xPosition = '40';
    klantSignHere.yPosition = '220';
    klantSigner.tabs.signHereTabs = [klantSignHere];

    const inkoperSigner = new docusign.Signer();
    inkoperSigner.email = emailInkoper;
    inkoperSigner.name = 'Inkoper';
    inkoperSigner.recipientId = '2';
    inkoperSigner.routingOrder = '2';
    inkoperSigner.tabs = new docusign.Tabs();
    const inkoperSignHere = new docusign.SignHere();
    inkoperSignHere.documentId = '1';
    inkoperSignHere.pageNumber = '1';
    inkoperSignHere.xPosition = '40';
    inkoperSignHere.yPosition = '255';
    inkoperSigner.tabs.signHereTabs = [inkoperSignHere];

    const envelopeDefinition = new docusign.EnvelopeDefinition();
    envelopeDefinition.emailSubject = typeof onderwerp === 'string' && onderwerp.trim()
      ? onderwerp
      : `Inkoopfactuur ${auto ?? ''}`.trim();
    envelopeDefinition.emailBlurb = typeof bericht === 'string' && bericht.trim()
      ? bericht
      : 'Onderteken deze inkoopfactuur digitaal via DocuSign.';
    envelopeDefinition.documents = [document];
    envelopeDefinition.recipients = new docusign.Recipients();
    envelopeDefinition.recipients.signers = [klantSigner, inkoperSigner];
    envelopeDefinition.status = 'sent';

    const result = await envelopesApi.createEnvelope(DOCUSIGN_ACCOUNT_ID, { envelopeDefinition });
    return NextResponse.json({ ok: true, envelopeId: result.envelopeId, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    console.error('[consignatie/docusign] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
