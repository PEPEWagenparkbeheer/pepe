// POST /api/leads/send — verstuurt een lead-antwoord vanaf info@ naar de klant.
// Auth: ingelogde PEPE-gebruiker. Voegt de PEPE-handtekening toe en, bij inruil,
// de waardebepaling-PDF als bijlage. Body: { to, subject, body, inruil?, wie? }.

import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { readAzureConfig, getAccessToken, sendMail, type MailBijlage } from '@/lib/graph';
import { leadHandtekening } from '@/lib/leads/handtekening';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const b = await req.json();
    const to: string = (b?.to ?? '').trim();
    const body: string = (b?.body ?? '').trim();
    const subject: string = (b?.subject ?? '').trim() || `Betreft: ${b?.auto ?? 'je aanvraag'}`;
    if (!to || !/.+@.+\..+/.test(to))
      return NextResponse.json({ error: 'Geen geldig e-mailadres van de klant.' }, { status: 400 });
    if (!body) return NextResponse.json({ error: 'Leeg bericht.' }, { status: 400 });

    const gekozenWie = typeof b?.wie === 'string' ? b.wie.trim() : '';
    let medewerker = null;
    if (gekozenWie) {
      const { data } = await supabaseAdmin
        .from('medewerkers')
        .select('naam, volledige_naam, mobiel, handtekening_foto_url')
        .ilike('naam', gekozenWie)
        .eq('actief', true)
        .maybeSingle();
      medewerker = data;
    }
    if (!medewerker && gate.user.email) {
      const { data } = await supabaseAdmin
        .from('medewerkers')
        .select('naam, volledige_naam, mobiel, handtekening_foto_url')
        .ilike('email', gate.user.email)
        .eq('actief', true)
        .maybeSingle();
      medewerker = data;
    }

    const bodyHtml =
      `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;line-height:1.5">` +
      escapeHtml(body).replace(/\n/g, '<br>') +
      `</div>` +
      leadHandtekening(medewerker ? {
        naam: medewerker.naam,
        volledigeNaam: medewerker.volledige_naam,
        mobiel: medewerker.mobiel,
        fotoUrl: medewerker.handtekening_foto_url,
      } : null);

    // Bij inruil: de waardebepaling-PDF (uit /public) als bijlage meesturen.
    const bijlagen: MailBijlage[] = [];
    if (b?.inruil) {
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/waardebepaling-inruil.pdf`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        bijlagen.push({
          naam: 'PEPE Waardebepaling.pdf',
          contentType: 'application/pdf',
          base64: buf.toString('base64'),
        });
      } else {
        console.warn('[leads/send] PDF niet gevonden, verstuur zonder bijlage');
      }
    }

    const from = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
    const { accessToken } = await getAccessToken(readAzureConfig());
    await sendMail(accessToken, from, to, subject, bodyHtml, bijlagen);

    return NextResponse.json({ ok: true, from, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads/send] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
