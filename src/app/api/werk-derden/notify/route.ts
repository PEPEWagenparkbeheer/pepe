/**
 * POST /api/werk-derden/notify
 * Body: { id: string; event: 'ingediend' | 'goedgekeurd' | 'afgekeurd' }
 *
 * Verstuurt e-mailnotificaties voor WerkDerden-statuswijzigingen via Postmark:
 *   ingediend   → info@pepewagenparkbeheer.nl  (PEPE ontvangt, partner wacht)
 *   goedgekeurd → partner e-mail
 *   afgekeurd   → partner e-mail + reden
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verstuurMail } from '@/lib/mail/send';
import { getPartnerMail } from '@/lib/werk-derden/partner-mail';
import { requireUser } from '@/lib/apiAuth';
import type { WerkDerdenRecord } from '@/types';

type NotifyEvent = 'ingediend' | 'goedgekeurd' | 'afgekeurd';

const PEPE_MAIL = 'info@pepewagenparkbeheer.nl';

function autoLabel(rec: WerkDerdenRecord): string {
  const voertuig = rec.kenteken ?? rec.meldcode ?? '—';
  const merk = [rec.merk, rec.model].filter(Boolean).join(' ');
  return merk ? `${voertuig} (${merk})` : voertuig;
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;

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

  // Partner-e-mail: eerst uit partner_lijst (beheerd in Instellingen), anders hardcoded fallback.
  async function partnerEmail(naam: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('partner_lijst')
      .select('email')
      .ilike('naam', naam)
      .limit(1)
      .maybeSingle();
    const uitDb = (data as { email?: string | null } | null)?.email?.trim();
    return uitDb || getPartnerMail(naam);
  }

  try {
    if ((event as NotifyEvent) === 'ingediend') {
      await verstuurMail({
        to: PEPE_MAIL,
        subject: `[Flow] ${partner} wacht op goedkeuring`,
        html: `<p><strong>${partner}</strong> heeft een offerte/aanvraag ingediend ter goedkeuring.</p>
               <p><strong>Auto:</strong> ${label}</p>
               <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
               <p><strong>Inkoop:</strong> € ${(wdRec.inkoop_bedrag ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
               <p>Controleer de <a href="https://flow.pepewagenparkbeheer.nl">Flow app</a> voor details en bijlage.</p>`,
      });
    } else if ((event as NotifyEvent) === 'goedgekeurd') {
      const partnerMail = await partnerEmail(partner);
      if (!partnerMail) {
        console.warn(`[notify] Geen e-mailadres bekend voor partner: ${partner}`);
        return NextResponse.json({ ok: true, skipped: 'partner e-mail onbekend' });
      }
      const voorwaarden = wdRec.voorwaarden
        ? `<p><strong>Voorwaarden / aanpassingen:</strong><br>${wdRec.voorwaarden.replace(/\n/g, '<br>')}</p>`
        : '';
      await verstuurMail({
        to: partnerMail,
        subject: '[Flow] PEPE heeft aanvraag/offerte goedgekeurd',
        html: `<p>Beste ${partner},</p>
               <p>PEPE heeft uw aanvraag/offerte goedgekeurd.</p>
               <p><strong>Auto:</strong> ${label}</p>
               <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
               ${voorwaarden}
               <p>U kunt de werkzaamheden uitvoeren.</p>
               <p>Met vriendelijke groet,<br>PEPE Wagenparkbeheer</p>`,
      });
    } else if ((event as NotifyEvent) === 'afgekeurd') {
      const partnerMail = await partnerEmail(partner);
      if (!partnerMail) {
        console.warn(`[notify] Geen e-mailadres bekend voor partner: ${partner}`);
        return NextResponse.json({ ok: true, skipped: 'partner e-mail onbekend' });
      }
      const reden = wdRec.afkeur_reden
        ? `<p><strong>Reden:</strong> ${wdRec.afkeur_reden}</p>`
        : '';
      await verstuurMail({
        to: partnerMail,
        subject: '[Flow] PEPE heeft aanvraag/offerte afgekeurd',
        html: `<p>Beste ${partner},</p>
               <p>PEPE heeft uw aanvraag/offerte helaas afgekeurd.</p>
               <p><strong>Auto:</strong> ${label}</p>
               <p><strong>Klant:</strong> ${wdRec.klant ?? '—'}</p>
               ${reden}
               <p>Neem contact op als u vragen heeft.</p>
               <p>Met vriendelijke groet,<br>PEPE Wagenparkbeheer</p>`,
      });
    }
  } catch (e) {
    console.error(`[notify] verstuurMail mislukt (event=${event}):`, e);
    return NextResponse.json({ error: 'E-mail versturen mislukt' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
