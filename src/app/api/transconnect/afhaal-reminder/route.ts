// GET /api/transconnect/afhaal-reminder — Vercel Cron (dagelijks).
// Stuurt 2 dagen vóór de geplande afhaaldatum één mail per auto naar de administratie:
// "Let op: auto wordt opgehaald — graag de betaling in orde maken."
// Auth: Vercel stuurt 'Authorization: Bearer <CRON_SECRET>'. Handmatig testen kan met
// ?secret=<CRON_SECRET> of ?secret=<BREIN_SYNC_SECRET>.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verstuurMail } from '@/lib/mail/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CRON_SECRET = process.env.CRON_SECRET ?? '';
// Administratie-ontvanger; overschrijfbaar via env zonder code-wijziging.
const REMINDER_TO = process.env.AFHAAL_REMINDER_TO ?? 'joelle@pepewagenparkbeheer.nl';

function geautoriseerd(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  const secret = new URL(req.url).searchParams.get('secret');
  const syncSecret = process.env.BREIN_SYNC_SECRET ?? '';
  return (!!CRON_SECRET && secret === CRON_SECRET) || (!!syncSecret && secret === syncSecret);
}

function datumNl(d?: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return d;
  }
}

export async function GET(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Vandaag t/m vandaag+2: vangt zowel exact 2 dagen vooraf als orders die met
  // kortere aanlevertijd binnenkomen. Verleden datums worden bewust overgeslagen.
  const now = new Date();
  const vandaag = now.toISOString().slice(0, 10);
  const plus2 = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);

  const { data: records, error } = await supabase
    .from('after_sales')
    .select('id, kenteken, merk, model, klant, transport_order_id, transportdatum, geplande_afhaaldatum')
    .eq('type', 'import')
    .eq('gearchiveerd', false)
    .eq('binnen', false)
    .is('afhaal_reminder_sent_at', null)
    .not('geplande_afhaaldatum', 'is', null)
    .gte('geplande_afhaaldatum', vandaag)
    .lte('geplande_afhaaldatum', plus2);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!records?.length) return NextResponse.json({ ok: true, verstuurd: 0 });

  let verstuurd = 0;
  const fouten: string[] = [];

  for (const r of records) {
    const auto = [r.merk, r.model].filter(Boolean).join(' ') || 'auto';
    const kenteken = r.kenteken ?? '—';
    const afhaal = datumNl(r.geplande_afhaaldatum);
    const lever = datumNl(r.transportdatum);
    const klant = r.klant ?? '—';

    const subject = `Auto wordt opgehaald op ${afhaal} — betaling in orde maken (${kenteken})`;
    const html = `
      <p><strong>Let op: deze auto wordt over (max.) 2 dagen opgehaald — graag de betaling in orde maken.</strong></p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0"><strong>Kenteken</strong></td><td>${kenteken}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Auto</strong></td><td>${auto}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Klant</strong></td><td>${klant}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Geplande afhaaldatum</strong></td><td>${afhaal}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Geplande leverdatum</strong></td><td>${lever}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>TransConnect order</strong></td><td>${r.transport_order_id ?? '—'}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:12px">Automatisch verstuurd vanuit Flow (TransConnect-koppeling).</p>
    `;

    try {
      await verstuurMail({ to: REMINDER_TO, subject, html });
      // Markeer als verstuurd zodat de reminder maar één keer per auto gaat.
      await supabase
        .from('after_sales')
        .update({ afhaal_reminder_sent_at: new Date().toISOString() })
        .eq('id', r.id);
      verstuurd++;
    } catch (e) {
      fouten.push(`${kenteken} (${r.transport_order_id ?? '?'}): ${String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, verstuurd, fouten });
}
