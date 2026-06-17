// POST /api/brein/send
// Verstuurt het concept-antwoord als reply op de originele mail, namens fues@,
// met de officiële handtekening eronder. Zet status op 'verzonden' + stamp.
// Body: { id, door }   Auth: ?secret=BREIN_SYNC_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { readAzureConfig, getAccessToken } from '@/lib/graph';
import { OFFICIELE_HANDTEKENING } from '@/lib/brein/handtekening';
import { requirePepe } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Platte concepttekst → veilige HTML (escape + regelafbrekingen). */
function conceptNaarHtml(tekst: string): string {
  const esc = tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.5">${esc.replace(/\n/g, '<br />')}</div>`;
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  let id: string | undefined;
  let door = '?';
  try {
    const b = (await req.json()) as { id?: string; door?: string };
    id = b.id;
    if (b.door) door = b.door;
  } catch {
    return NextResponse.json({ error: 'Body moet { id } bevatten' }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: 'id ontbreekt' }, { status: 400 });

  // 1. Bericht ophalen
  const { data: bericht, error: fetchError } = await supabaseAdmin
    .from('brein_messages')
    .select('id, mailbox, graph_message_id, concept_antwoord, status, historie')
    .eq('id', id)
    .single();

  if (fetchError || !bericht) {
    return NextResponse.json({ error: fetchError?.message ?? 'Bericht niet gevonden' }, { status: 404 });
  }
  if (!bericht.concept_antwoord || !bericht.concept_antwoord.trim()) {
    return NextResponse.json({ error: 'Geen concept-antwoord om te versturen' }, { status: 400 });
  }
  if (bericht.status === 'verzonden') {
    return NextResponse.json({ error: 'Dit bericht is al verzonden' }, { status: 409 });
  }

  const htmlBody = conceptNaarHtml(bericht.concept_antwoord) + OFFICIELE_HANDTEKENING;

  try {
    const { accessToken } = await getAccessToken(readAzureConfig());
    const H = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const userBase = `${GRAPH}/users/${encodeURIComponent(bericht.mailbox)}`;

    // 2. Reply-concept aanmaken (juiste ontvanger, onderwerp en thread)
    const replyRes = await fetch(`${userBase}/messages/${encodeURIComponent(bericht.graph_message_id)}/createReply`, {
      method: 'POST',
      headers: H,
    });
    if (!replyRes.ok) {
      const e = await replyRes.json().catch(() => ({}));
      throw new Error(`createReply ${replyRes.status}: ${e?.error?.message ?? ''}`);
    }
    const draft = (await replyRes.json()) as { id: string };

    // 3. Body vervangen door ons antwoord + handtekening
    const patchRes = await fetch(`${userBase}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ body: { contentType: 'HTML', content: htmlBody } }),
    });
    if (!patchRes.ok) {
      const e = await patchRes.json().catch(() => ({}));
      throw new Error(`patch body ${patchRes.status}: ${e?.error?.message ?? ''}`);
    }

    // 4. Versturen
    const sendRes = await fetch(`${userBase}/messages/${encodeURIComponent(draft.id)}/send`, {
      method: 'POST',
      headers: H,
    });
    if (!sendRes.ok) {
      const e = await sendRes.json().catch(() => ({}));
      throw new Error(`send ${sendRes.status}: ${e?.error?.message ?? ''}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brein/send] Versturen mislukt:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 5. Status + stamp bijwerken
  const nu = new Date().toISOString();
  const historie = [...((bericht.historie as unknown[]) ?? []), { status: 'verzonden', op: nu, door }];
  const { error: updateError } = await supabaseAdmin
    .from('brein_messages')
    .update({ status: 'verzonden', verzonden_op: nu, behandeld_door: door, historie })
    .eq('id', id);

  if (updateError) {
    // Mail is verstuurd, maar status-update faalde — meld het zodat het handmatig kan.
    return NextResponse.json(
      { ok: true, warning: `Verstuurd, maar status niet bijgewerkt: ${updateError.message}` },
    );
  }

  return NextResponse.json({ ok: true, verzonden_op: nu });
}
