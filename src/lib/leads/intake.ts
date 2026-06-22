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

/** Leest info@ uit, verwerkt nieuwe mails als lead/tender/reactie, dedupt via de ledger-tabel. */
export async function runLeadsIntake(): Promise<LeadsIntakeResult> {
  const mailbox = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
  const leeg: LeadsIntakeResult = { mailbox, verwerkt: 0, leads: 0, tenders: 0, skipped: 0 };

  try {
    const { accessToken } = await getAccessToken(readAzureConfig());
    // Ruime marge zodat ook bij een piek geen mail buiten beeld valt; de ledger dedupt.
    const messages = await getRecentMessages(accessToken, mailbox, 100);
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

    // Bouw een map van conversationId => lead voor snelle reply-detectie.
    const convIds = nieuw.map((m) => m.conversationId).filter(Boolean) as string[];
    let convLead = new Map<string, { id: string; klant_reacties: unknown[] }>();
    if (convIds.length > 0) {
      const { data: bestaande } = await supabaseAdmin
        .from('leads')
        .select('id, klant_reacties, graph_conversation_id')
        .in('graph_conversation_id', convIds);
      convLead = new Map(
        (bestaande ?? [])
          .filter((l) => l.graph_conversation_id)
          .map((l) => [l.graph_conversation_id as string, l]),
      );
    }

    // Email-fallback: leads zonder graph_conversation_id (bijv. via Postmark aangemaakt)
    // worden herkend via het afzender-emailadres.
    const externeEmails = nieuw
      .map((m) => m.afzenderEmail.toLowerCase())
      .filter((e) => e && !e.includes('pepewagenparkbeheer.nl'));
    let emailLead = new Map<string, { id: string; klant_reacties: unknown[] }>();
    if (externeEmails.length > 0) {
      const { data: opEmail } = await supabaseAdmin
        .from('leads')
        .select('id, klant_reacties, email')
        .in('email', externeEmails)
        .eq('gearchiveerd', false)
        .is('graph_conversation_id', null)
        .order('created_at', { ascending: false });
      for (const l of opEmail ?? []) {
        if (l.email && !emailLead.has(l.email.toLowerCase())) {
          emailLead.set(l.email.toLowerCase(), l);
        }
      }
    }

    for (const m of nieuw) {
      let resultaat: 'lead' | 'tender' | 'skipped' | 'reactie' = 'skipped';
      try {
        const tekst = htmlNaarTekst(m.bodyHtml) || m.bodyPreview;

        // Klantreactie op bestaand gesprek — voeg toe aan lead, maak geen nieuwe lead.
        // Primaire match: via graph_conversation_id. Fallback: via afzender-email (voor
        // leads aangemaakt vóór de graph_conversation_id kolom of via Postmark).
        const bestaandeLead =
          (m.conversationId ? convLead.get(m.conversationId) : null) ??
          (!m.afzenderEmail.toLowerCase().includes('pepewagenparkbeheer.nl')
            ? emailLead.get(m.afzenderEmail.toLowerCase())
            : null) ??
          null;
        if (bestaandeLead) {
          const reacties = (bestaandeLead.klant_reacties ?? []) as Array<Record<string, unknown>>;
          reacties.push({
            tekst: tekst || m.bodyPreview,
            op: m.ontvangenOp,
            naam: m.afzenderNaam || m.afzenderEmail,
            gelezen: false,
          });
          await supabaseAdmin
            .from('leads')
            .update({ klant_reacties: reacties })
            .eq('id', bestaandeLead.id);
          resultaat = 'reactie';
          leads++;
        } else {
          // Skip interne doorstuurmails met "voor brein" in subject of body.
          const isVoorBrein = /voor\s*brein/i.test(m.subject || '') || /voor\s*brein/i.test(tekst);
          if (isVoorBrein) {
            resultaat = 'skipped';
            skipped++;
          } else {
            const r = await verwerkLeadMail({
              from: m.afzenderEmail,
              fromName: m.afzenderNaam,
              subject: m.subject,
              textBody: tekst,
              htmlBody: m.bodyHtml,
              altijdExtraheren: true,
              graphMessageId: m.id,
              graphConversationId: m.conversationId,
            });
            resultaat = r.routed;
            if (r.routed === 'lead') leads++;
            else if (r.routed === 'tender') tenders++;
            else skipped++;
          }
        }
      } catch (e) {
        // Niet in ledger zetten => volgende run opnieuw proberen.
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
