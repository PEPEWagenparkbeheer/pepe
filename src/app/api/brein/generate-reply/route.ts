// POST /api/brein/generate-reply
// Stateless antwoord-generator: neemt mail-inhoud direct als input, slaat niets op.
// Gebruikt door de Outlook add-in. Auth: requirePepe() (Supabase sessie).

import { NextRequest, NextResponse } from 'next/server';
import { genereerConcept } from '@/lib/brein/concept';
import { classifyBericht } from '@/lib/brein/classifier';
import { PEPE_PROCEDURES } from '@/lib/brein/kennis';
import { buildBreinContext } from '@/lib/brein/context';
import { OFFICIELE_HANDTEKENING } from '@/lib/brein/handtekening';
import { readAzureConfig, getAccessToken, getSentMessages } from '@/lib/graph';
import { laadBreinFeedback } from '@/lib/brein/feedback';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function htmlNaarTekst(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const body = await req.json() as {
    mailbox?: string;
    subject?: string;
    from?: string;
    fromName?: string;
    bodyText?: string;
    bodyHtml?: string;
  };

  const {
    mailbox = '',
    subject = '',
    from = '',
    fromName = '',
    bodyText = '',
    bodyHtml = '',
  } = body;

  const plainBody = bodyText || (bodyHtml ? htmlNaarTekst(bodyHtml) : '');

  const classified = await classifyBericht({
    onderwerp: subject || null,
    afzender_naam: fromName || null,
    afzender_email: from || null,
    body_preview: plainBody.slice(0, 600),
  });

  const contextDelen = await buildBreinContext({
    afzenderEmail: from || null,
    kenteken: classified.kenteken,
  });

  let stijlvoorbeelden: { subject: string; bodyPreview: string }[] = [];
  try {
    if (mailbox) {
      const { accessToken } = await getAccessToken(readAzureConfig());
      stijlvoorbeelden = await getSentMessages(accessToken, mailbox, 6);
    }
  } catch {
    // Geen stijlvoorbeelden beschikbaar
  }

  const feedbackScope = mailbox.startsWith('info@') ? 'leads' : 'brein';
  const feedbackLessen = await laadBreinFeedback(feedbackScope);

  const concept = await genereerConcept({
    mailbox,
    onderwerp: subject || null,
    afzenderNaam: fromName || null,
    afzenderEmail: from || null,
    categorie: classified.categorie,
    body: plainBody.slice(0, 4000),
    stijlvoorbeelden,
    context: contextDelen.join('\n') || undefined,
    procedures: PEPE_PROCEDURES,
    feedbackLessen,
  });

  const conceptHtml = concept
    .split('\n')
    .map((l) => `<p>${l.trim() || '&nbsp;'}</p>`)
    .join('');
  const replyHtml = `${conceptHtml}\n${OFFICIELE_HANDTEKENING}`;

  return NextResponse.json({
    category: classified.categorie,
    confidence: 0.9,
    replyHtml,
  });
}
