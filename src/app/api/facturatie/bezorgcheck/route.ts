// GET /api/facturatie/bezorgcheck — leest NDR's (onbestelbaar-meldingen) in info@ en markeert
// verstuurde facturen waarvan de mail bounce­te als "bezorging mislukt". Graph accepteert mail
// synchroon; een bounce komt pas later als retourmail in info@ → daarom deze check.
// Auth: ingelogde PEPE of ?secret=CRON_SECRET (voor een eventuele cron).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import { getRecentMessages } from '@/lib/graph/mail';
import { getAccessToken, readAzureConfig } from '@/lib/graph/auth';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const NDR_RE = /onbestelbaar|undeliverable|niet worden bezorgd|delivery (has )?failed|mail delivery|postmaster/i;

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (!(CRON_SECRET && secret === CRON_SECRET)) {
    const gate = await requireFacturatie(req);
    if (!gate.ok) return gate.response;
  }

  const from = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
  let token: string;
  try { token = (await getAccessToken(readAzureConfig())).accessToken; }
  catch (e) { return NextResponse.json({ error: `Graph-token: ${String(e)}` }, { status: 500 }); }

  let berichten;
  try { berichten = await getRecentMessages(token, from, 50); }
  catch (e) { return NextResponse.json({ error: `Mailbox lezen: ${String(e)}` }, { status: 502 }); }

  // NDR-teksten (onderwerp + body) verzamelen.
  const ndrTeksten = berichten
    .filter((m) => NDR_RE.test(`${m.subject} ${m.afzenderEmail} ${m.afzenderNaam}`))
    .map((m) => `${m.subject}\n${m.bodyPreview}\n${m.bodyHtml}`.toLowerCase());
  if (!ndrTeksten.length) return NextResponse.json({ ok: true, ndr: 0, gemarkeerd: 0 });

  // Recent verzonden facturen die nog niet als mislukt staan.
  const sinds = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: facturen } = await supabaseAdmin
    .from('uitgaande_facturen')
    .select('id, verzonden_naar')
    .eq('status', 'verzonden').eq('bezorging_mislukt', false)
    .gte('verzonden_op', sinds);

  let gemarkeerd = 0;
  for (const f of facturen ?? []) {
    const adres = (f.verzonden_naar ?? '').toLowerCase().trim();
    if (!adres) continue;
    if (ndrTeksten.some((t) => t.includes(adres))) {
      await supabaseAdmin.from('uitgaande_facturen')
        .update({ bezorging_mislukt: true, bezorg_reden: `E-mail kon niet worden bezorgd op ${f.verzonden_naar}` })
        .eq('id', f.id);
      gemarkeerd++;
    }
  }
  return NextResponse.json({ ok: true, ndr: ndrTeksten.length, gemarkeerd });
}
