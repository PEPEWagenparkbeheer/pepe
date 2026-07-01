// GET /api/facturatie/bpm-import — haalt Belastingdienst BPM-betaalberichten uit info@ en vult
// rest-BPM in op de matchende import-auto (+ vinkt BPM goedgekeurd af, synct de gekoppelde factuur).
// Auth: ingelogde PEPE, of ?secret=CRON_SECRET / Authorization: Bearer CRON_SECRET (pg_cron).
import { NextRequest, NextResponse } from 'next/server';
import { requireFacturatie } from '@/lib/apiAuth';
import { getAccessToken, readAzureConfig } from '@/lib/graph/auth';
import { verwerkBpmInbox } from '@/lib/factuur/bpmbericht-import';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const viaCron = CRON_SECRET && (secret === CRON_SECRET || bearer === CRON_SECRET);
  if (!viaCron) {
    const gate = await requireFacturatie(req);
    if (!gate.ok) return gate.response;
  }

  const mailbox = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
  let token: string;
  try { token = (await getAccessToken(readAzureConfig())).accessToken; }
  catch (e) { return NextResponse.json({ error: `Graph-token: ${String(e)}` }, { status: 500 }); }

  const top = Math.min(Number(url.searchParams.get('top') ?? 200) || 200, 400);
  try {
    const r = await verwerkBpmInbox(token, mailbox, top);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: `Verwerken mislukt: ${String(e)}` }, { status: 502 });
  }
}
