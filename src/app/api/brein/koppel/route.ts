// POST /api/brein/koppel — extraheert inzetdocument-gegevens en koppelt aan HubSpot.
// Vindt/maakt Contact (berijder), Company (bedrijf), Deal (auto op kenteken).
// Zet deal op rijdend, slaat alle contractdetails op, koppelt associaties.
// Body: { berichtId: string }

import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { extraheertInzetdocument } from '@/lib/brein/inzetdocument';
import { koppelInzet } from '@/lib/documentenstroom/koppelInzet';

export const runtime = 'nodejs';

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
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const { berichtId } = await req.json() as { berichtId: string };
    if (!berichtId) return NextResponse.json({ error: 'berichtId ontbreekt' }, { status: 400 });

    const { data: bericht, error: fetchErr } = await supabaseAdmin
      .from('brein_messages')
      .select('id, onderwerp, body_html, body_preview, afzender_naam, afzender_email')
      .eq('id', berichtId)
      .maybeSingle();
    if (fetchErr || !bericht) {
      return NextResponse.json({ error: 'Bericht niet gevonden' }, { status: 404 });
    }

    const bodyTekst = htmlNaarTekst(bericht.body_html ?? '') || (bericht.body_preview ?? '');
    const ext = await extraheertInzetdocument(bericht.onderwerp ?? '', bodyTekst);

    const result = await koppelInzet(ext);

    await supabaseAdmin
      .from('brein_messages')
      .update({ status: 'afgehandeld', verwerkt_op: new Date().toISOString() })
      .eq('id', berichtId);

    return NextResponse.json({
      ok: true,
      log: result.log,
      extract: ext,
      hubspot: { contactId: result.contactId, companyId: result.companyId, dealId: result.dealId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brein/koppel] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
