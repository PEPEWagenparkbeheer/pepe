// POST /api/uitgaande-facturen/[id]/verzend
// Ontvangt de client-gegenereerde PDF (base64), slaat 'm op in Storage en mailt 'm via Graph.
// Los herstartbaar: raakt Twinfield niet aan. Body: { pdfBase64, to?, subject?, bodyHtml? }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requirePepe } from '@/lib/apiAuth';
import { sendMail } from '@/lib/graph/mail';
import { getAccessToken, readAzureConfig } from '@/lib/graph/auth';
import type { UitgaandeFactuur } from '@/types/factuur';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const pdfBase64: string | undefined = body.pdfBase64;
  if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 vereist' }, { status: 400 });

  const { data: f } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  const factuur = f as UitgaandeFactuur;

  const nummer = factuur.factuurnummer || factuur.id;
  const jaar = (factuur.factuurdatum ?? new Date().toISOString()).slice(0, 4);
  const bestandsnaam = `PEPE-Factuur-${nummer}.pdf`;
  const storagePath = `${jaar}/${nummer}.pdf`;

  // Upload naar Storage (overschrijven mag bij retry)
  const buffer = Buffer.from(pdfBase64, 'base64');
  const { error: upErr } = await supabaseAdmin.storage
    .from('uitgaande-facturen')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ error: `Opslaan mislukt: ${upErr.message}` }, { status: 500 });

  // Mailen via Graph (info@), met PDF-bijlage
  const to: string = body.to || factuur.factuur_email || factuur.email || '';
  if (!to) {
    // PDF wel opgeslagen, alleen geen ontvanger
    await supabaseAdmin.from('uitgaande_facturen').update({ pdf_storage_path: storagePath }).eq('id', id);
    return NextResponse.json({ error: 'Geen ontvanger (factuur_email/email leeg)', pdfOpgeslagen: true }, { status: 400 });
  }

  const from = process.env.LEADS_MAILBOX || 'info@pepewagenparkbeheer.nl';
  let accessToken: string;
  try {
    accessToken = (await getAccessToken(readAzureConfig())).accessToken;
  } catch (e) {
    await supabaseAdmin.from('uitgaande_facturen').update({ pdf_storage_path: storagePath }).eq('id', id);
    return NextResponse.json({ error: `Graph-token mislukt: ${String(e)}`, pdfOpgeslagen: true }, { status: 500 });
  }

  const subject = body.subject || `Factuur ${nummer} — PEPE Wagenparkbeheer`;
  const bodyHtml = body.bodyHtml || `
    <p>Beste ${factuur.tav || factuur.klant_naam || 'relatie'},</p>
    <p>In de bijlage vindt u factuur <strong>${nummer}</strong>.</p>
    <p>Met vriendelijke groet,<br/>PEPE Wagenparkbeheer</p>`;

  try {
    await sendMail(accessToken, from, to, subject, bodyHtml, [
      { naam: bestandsnaam, contentType: 'application/pdf', base64: pdfBase64 },
    ]);
  } catch (e) {
    await supabaseAdmin.from('uitgaande_facturen').update({ pdf_storage_path: storagePath }).eq('id', id);
    return NextResponse.json({ error: `Mail mislukt: ${String(e)}`, pdfOpgeslagen: true }, { status: 500 });
  }

  const { data: updated } = await supabaseAdmin
    .from('uitgaande_facturen')
    .update({
      status: 'verzonden',
      verzonden_op: new Date().toISOString(),
      verzonden_naar: to,
      pdf_storage_path: storagePath,
    })
    .eq('id', id).select('*').single();

  return NextResponse.json({ factuur: updated });
}
