// src/lib/brein/sync.ts
// Haalt mail op uit Outlook (Graph) → Supabase. Multi-mailbox: loopt over alle
// geconfigureerde mailboxen, zodat een nieuwe klant toevoegen = één regel config.
// Server-only. Gebruikt door /api/brein/sync (knop) en /api/brein/cron (Vercel).

import { readAzureConfig, getAccessToken, getRecentMessages } from '@/lib/graph';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface MailboxSyncResult {
  mailbox: string;
  synced: number;
  skipped: number;
  error?: string;
}

/**
 * Geconfigureerde BREIN-mailboxen. Komma-gescheiden in BREIN_MAILBOXES,
 * met BREIN_MAILBOX als fallback (één mailbox).
 */
export function getBreinMailboxes(): string[] {
  const raw = process.env.BREIN_MAILBOXES ?? process.env.BREIN_MAILBOX ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Synct één mailbox: nieuwe mails invoegen, gelezen-status van bekende bijwerken. */
export async function syncMailbox(accessToken: string, mailbox: string): Promise<MailboxSyncResult> {
  const messages = await getRecentMessages(accessToken, mailbox, 50);
  if (messages.length === 0) return { mailbox, synced: 0, skipped: 0 };

  const graphIds = messages.map((m) => m.id);
  const { data: existing } = await supabaseAdmin
    .from('brein_messages')
    .select('graph_message_id')
    .in('graph_message_id', graphIds);

  const existingIds = new Set((existing ?? []).map((r) => r.graph_message_id));

  // Gelezen-status van reeds bekende berichten bijwerken.
  const bekend = messages.filter((m) => existingIds.has(m.id));
  await Promise.allSettled(
    bekend.map((m) =>
      supabaseAdmin.from('brein_messages').update({ is_read: m.isRead }).eq('graph_message_id', m.id),
    ),
  );

  const nieuw = messages.filter((m) => !existingIds.has(m.id));
  if (nieuw.length === 0) return { mailbox, synced: 0, skipped: messages.length };

  const rows = nieuw.map((m) => ({
    graph_message_id: m.id,
    mailbox,
    onderwerp: m.subject,
    afzender_email: m.afzenderEmail,
    afzender_naam: m.afzenderNaam,
    ontvangen_op: m.ontvangenOp,
    body_preview: m.bodyPreview,
    body_html: m.bodyHtml,
    is_read: m.isRead,
    status: 'nieuw',
  }));

  const { error } = await supabaseAdmin.from('brein_messages').insert(rows);
  if (error) throw new Error(`insert mislukt: ${error.message}`);

  return { mailbox, synced: nieuw.length, skipped: existingIds.size };
}

/** Synct alle geconfigureerde mailboxen. */
export async function runBreinSync(): Promise<MailboxSyncResult[]> {
  const mailboxes = getBreinMailboxes();
  if (mailboxes.length === 0) throw new Error('Geen BREIN-mailbox geconfigureerd (BREIN_MAILBOXES/BREIN_MAILBOX)');

  const { accessToken } = await getAccessToken(readAzureConfig());

  const results: MailboxSyncResult[] = [];
  for (const mb of mailboxes) {
    try {
      results.push(await syncMailbox(accessToken, mb));
    } catch (err) {
      results.push({ mailbox: mb, synced: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
