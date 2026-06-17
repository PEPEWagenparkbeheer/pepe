import { NextRequest, NextResponse } from 'next/server';
import {
  getAccessToken,
  DOCUSIGN_BASE,
  DOCUSIGN_ACCOUNT,
  DOCUSIGN_OAUTH,
  BOEKHOUDER_EMAIL,
} from '@/lib/consignatie-docusign';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function stripDataUri(value: string): string {
  // Verwerk zowel pure base64 als een volledige data-URI (eventueel met ;filename=…).
  const idx = value.indexOf('base64,');
  return idx >= 0 ? value.slice(idx + 'base64,'.length) : value;
}

// Health-check: probeert een JWT-token te halen. Geen secrets in de respons.
// GET /api/consignatie/docusign → { ok, oauthBase } of { ok:false, error }.
export async function GET() {
  try {
    await getAccessToken();
    return NextResponse.json({ ok: true, oauthBase: DOCUSIGN_OAUTH, baseUrl: DOCUSIGN_BASE });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, oauthBase: DOCUSIGN_OAUTH, baseUrl: DOCUSIGN_BASE, error: message });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

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

    const accessToken = await getAccessToken();

    const documentNaamFinal =
      typeof documentNaam === 'string' && documentNaam.trim()
        ? documentNaam
        : `Inkoopverklaring ${auto ?? ''}`.trim() || 'Inkoopverklaring';

    const envelopeDefinition = {
      emailSubject:
        typeof onderwerp === 'string' && onderwerp.trim()
          ? onderwerp
          : `Inkoopverklaring ${auto ?? ''}`.trim() || 'Inkoopverklaring',
      emailBlurb:
        typeof bericht === 'string' && bericht.trim()
          ? bericht
          : 'Onderteken deze inkoopverklaring digitaal via DocuSign.',
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
              // Anker \s1\ staat in de PDF bij het handtekeningvak van de verkoper.
              signHereTabs: [
                { anchorString: '\\s1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-6' },
              ],
            },
          },
          {
            email: emailInkoper,
            name: 'Inkoper',
            recipientId: '2',
            routingOrder: '2',
            tabs: {
              // Anker \s2\ staat bij het handtekeningvak van de inkoper (PEPE).
              signHereTabs: [
                { anchorString: '\\s2\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-6' },
              ],
            },
          },
        ],
        // Boekhouding (Basecone) als carbon copy met de hoogste routingOrder:
        // ontvangt automatisch de getekende verklaring zodra de envelope voltooid is.
        carbonCopies: [
          {
            email: BOEKHOUDER_EMAIL,
            name: 'Boekhouding PEPE (Basecone)',
            recipientId: '3',
            routingOrder: '3',
          },
        ],
      },
    };

    const res = await fetch(`${DOCUSIGN_BASE}/restapi/v2.1/accounts/${DOCUSIGN_ACCOUNT}/envelopes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeDefinition),
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
