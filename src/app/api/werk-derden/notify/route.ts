/**
 * POST /api/werk-derden/notify
 * Body: { id: string; event: 'ingediend' | 'goedgekeurd' | 'afgekeurd' }
 *
 * Verstuurt e-mailnotificaties voor WerkDerden-statuswijzigingen:
 *   ingediend  → info@pepewagenparkbeheer.nl  (PEPE ontvangt, partner wacht op goedkeuring)
 *   goedgekeurd → partner e-mail             (partner ontvangt goedkeuring)
 *   afgekeurd   → partner e-mail             (partner ontvangt afkeuring + reden)
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { readAzureConfig, getAccessToken, sendMail } from '@/lib/graph';
import { getPartnerMail } from '@/lib/werk-derden/partner-mail';
import type { WerkDerdenRecord } from '@/types';

type NotifyEvent = 'ingediend' | 'goedgekeurd' | 'afgekeurd';

const PEPE_MAIL = 'info@pepewagenparkbeheer.nl';
const BREIN_MAILBOX = process.env.BREIN_MAILBOX ?? 'fues@pepewagenparkbeheer.nl';

function autoLabel(rec: WerkDerdenRecord): string {
  const voertuig = rec.kenteken ?? rec.meldcode ?? '—';
  const merk = [rec.merk, rec.model].filter(Boolean).join(' ');
  return merk ? `${voertuig} (${merk})` : voertuig;
}

export async function POST(req: NextRequest) {
  let body: { id?: string; event?: string };
  try {
    body = await req.json() as { id?: string; event?: string };
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON' }, { status: 400 });
  }

  const { id, event } = body;
  if (!id || !event) {
    return NextResponse.json({ error: 'id en event zijn verplicht' }, { status: 400 });
  }
  if (!['ingediend', 'goedgekeurd', 'afgekeurd'].includes(event)) {
    return NextResponse.json({ error: 'Ongeldig event' }, { status: 400 });
  }

  // Haal WD-record op
  const { data: rec, error: recErr } = await supabaseAdmin
    .from('werk_derden')
    .select('*')
    .eq('id', id)
    .single();

  if (recErr || !rec) {
    return NextResponse.json({ error: 'Record niet gevonden' }, { status: 404 });
  }

  const wdRec = rec as WerkDerdenRecord;
  const label = autoLabel(wdRec);
  const partner = wdRec.partner ?? 'Partner';

  // Graph access token
  let accessToken: string;
  try {
    const cfg = readAzureConfig();
    const tok = await getAccessToken(cfg);
    accessToken = tok.accessToken;
  } catch (e) {
    console.error('[notify] getAccessToken mislukt:', e);
    return NextResponse.json({ error: 'Graph authenticatie mislukt' }, { status: 500 });
  }

  try {
    if (event === 'ingediend') {
      await sendMail(
        accessToken,
        BREIN_MAILBOX,
        PEPE_MAIL,
        `[Flow] ${partner} wacht op goedkeuring`,
        `<p><strong>${partner}</strong> heeft een offerte/aanvraag ingediend ter goedkeuring.</p>
         <p><strong>Auto:</strong> ${label}</p>
         <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
         <p><strong>Inkoop:</strong> € ${(wdRec.inkoop_bedrag ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
         <p>Controleer de <a href="https://flow.pepewagenparkbeheer.nl">Flow app</a> voor details en bijlage.</p>`,
      );
    } else if (event === 'goedgekeurd') {
      const partnerMail = getPartnerMail(partner);
      if (!partnerMail) {
        console.warn(`[notify] Geen e-mailadres bekend voor partner: ${partner}`);
        return NextResponse.json({ ok: true, skipped: 'partner e-mail onbekend' });
      }
      const voorwaarden = wdRec.voorwaarden
        ? `<p><strong>Voorwaarden / aanpassingen:</strong><br>${wdRec.voorwaarden.replace(/\n/g, '<br>')}</p>`
        : '';
      await sendMail(
        accessToken,
        BREIN_MAILBOX,
        partnerMail,
        `[Flow] PEPE heeft aanvraag/offerte goedgekeurd`,
        `<p>Beste ${partner},</p>
         <p>PEPE heeft uw aanvraag/offerte goedgekeurd.</p>
         <p><strong>Auto:</strong> ${label}</p>
         <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
         ${voorwaarden}
         <p>U kunt de werkzaamheden uitvoeren.</p>
         <p>Met vriendelijke groet,<br>PEPE Wagenparkbeheer</p>`,
      );
    } else if (event === 'afgekeurd') {
      const partnerMail = getPartnerMail(partner);
      if (!partnerMail) {
        console.warn(`[notify] Geen e-mailadres bekend voor partner: ${partner}`);
        return NextResponse.json({ ok: true, skipped: 'partner e-mail onbekend' });
      }
      const reden = wdRec.afkeur_reden ? `<p><strong>Reden:</strong> ${wdRec.afkeur_reden}</p>` : '';
      await sendMail(
        accessToken,
        BREIN_MAILBOX,
        partnerMail,
        `[Flow] PEPE heeft aanvraag/offerte afgekeurd`,
        `<p>Beste ${partner},</p>
         <p>PEPE heeft uw aanvraag/offerte helaas afgekeurd.</p>
         <p><strong>Auto:</strong> ${label}</p>
         <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
         ${reden}
         <p>Neem contact op als u vragen heeft.</p>
         <p>Met vriendelijke groet,<br>PEPE Wagenparkbeheer</p>`,
      );
    }
  } catch (e) {
    console.error(`[notify] sendMail mislukt (event=${event}):`, e);
    return NextResponse.json({ error: 'E-mail versturen mislukt' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
