// src/lib/leads/intake.ts
// Automatische lead-intake: leest nieuwe mail uit info@ via Graph en haalt ze door
// de gedeelde verwerking (verwerk.ts). Vervangt het handmatig doorsturen naar Postmark.
// Dedup via tabel leads_inbox_verwerkt zodat elke mail één keer verwerkt wordt en de
// mailbox-status (gelezen/ongelezen) onaangeroerd blijft. Server-only.

import { readAzureConfig, getAccessToken, getRecentMessages } from '@/lib/graph';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verwerkLeadMail } from '@/lib/leads/verwerk';

export interface LeadsIntakeResult {
  mailbox: string;
  verwerkt: number;
  leads: number;
  tenders: number;
  skipped: number;
  error?: string;
}

/** Zet HTML-mailbody om naar redelijke platte tekst voor de LLM-extractie. */
function htmlNaarTekst(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Leest info@ uit, verwerkt nieuwe mails als lead/tender, dedupt via de ledger-tabel. */
export async function runLeadsIntake(): Promise<LeadsIntakeResult> {
  const mailbox = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
  const leeg: LeadsIntakeResult = { mailbox, verwerkt: 0, leads: 0, tenders: 0, skipped: 0 };

  try {
    const { accessToken } = await getAccessToken(readAzureConfig());
    const messages = await getRecentMessages(accessToken, mailbox, 50);
    if (messages.length === 0) return leeg;

    const ids = messages.map((m) => m.id);
    const { data: gedaan } = await supabaseAdmin
      .from('leads_inbox_verwerkt')
      .select('graph_message_id')
      .in('graph_message_id', ids);
    const gedaanSet = new Set((gedaan ?? []).map((r) => r.graph_message_id));

    const nieuw = messages.filter((m) => !gedaanSet.has(m.id));

    let leads = 0;
    let tenders = 0;
    let skipped = 0;

    for (const m of nieuw) {
      let resultaat: 'lead' | 'tender' | 'skipped' = 'skipped';
      try {
        const tekst = htmlNaarTekst(m.bodyHtml) || m.bodyPreview;
        const r = await verwerkLeadMail({
          from: m.afzenderEmail,
          fromName: m.afzenderNaam,
          subject: m.subject,
          textBody: tekst,
          htmlBody: m.bodyHtml,
          altijdExtraheren: true,
        });
        resultaat = r.routed;
        if (r.routed === 'lead') leads++;
        else if (r.routed === 'tender') tenders++;
        else skipped++;
      } catch (e) {
        // Niet in ledger zetten → volgende run opnieuw proberen.
        console.error('[leads/intake] verwerken mislukt voor', m.id, e instanceof Error ? e.message : e);
        continue;
      }

      await supabaseAdmin.from('leads_inbox_verwerkt').insert({
        graph_message_id: m.id,
        mailbox,
        ontvangen_op: m.ontvangenOp,
        resultaat,
      });
    }

    return { mailbox, verwerkt: nieuw.length, leads, tenders, skipped };
  } catch (err) {
    return { ...leeg, error: err instanceof Error ? err.message : String(err) };
  }
}
