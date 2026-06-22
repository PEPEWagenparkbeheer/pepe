// POST /api/leads/merge
// Voegt twee leads samen: de oudste wordt de primary, de nieuwste wordt gearchiveerd.
// Contact-info, klant_reacties en contactmomenten worden gecombineerd.

import { NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Lead, KlantReactie } from '@/types';

type Moment = { tekst: string; op: string; door: string };

const statusVolgorde: Record<string, number> = {
  nieuw: 0, opgepakt: 1, gebeld: 2, interesse: 3, verkocht: 4, geen_interesse: 5,
};

export async function POST(req: Request) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { primaryId, secondaryId } = (await req.json()) as {
    primaryId: string;
    secondaryId: string;
  };
  if (!primaryId || !secondaryId || primaryId === secondaryId) {
    return NextResponse.json({ error: 'Ongeldige IDs' }, { status: 400 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .in('id', [primaryId, secondaryId]);
  if (error || !rows || rows.length !== 2) {
    return NextResponse.json({ error: 'Leads niet gevonden' }, { status: 404 });
  }

  const [a, b] = rows as Lead[];
  // Primary = oudste (laagste created_at)
  const primary = (a.created_at ?? '') <= (b.created_at ?? '') ? a : b;
  const secondary = primary === a ? b : a;

  // Combineer klant_reacties gesorteerd op tijdstip
  const reacties: KlantReactie[] = [
    ...(primary.klant_reacties ?? []),
    ...(secondary.klant_reacties ?? []),
  ].sort((x, y) => x.op.localeCompare(y.op));

  // Dedup op exact zelfde tijdstip + tekst
  const reactiesDedup = reacties.filter(
    (r, i, arr) => arr.findIndex((x) => x.op === r.op && x.tekst === r.tekst) === i,
  );

  // Combineer contactmomenten gesorteerd op tijdstip
  const momenten: Moment[] = [
    ...((primary.contactmomenten as Moment[] | undefined) ?? []),
    ...((secondary.contactmomenten as Moment[] | undefined) ?? []),
  ].sort((x, y) => x.op.localeCompare(y.op));

  const momentenDedup = momenten.filter(
    (m, i, arr) => arr.findIndex((x) => x.op === m.op && x.tekst === m.tekst) === i,
  );

  // Hogere status wint
  const statusGetal = (s: string) => statusVolgorde[s] ?? 0;
  const status =
    statusGetal(secondary.status) > statusGetal(primary.status) ? secondary.status : primary.status;

  const merged: Partial<Lead> = {
    // Contact: primary wint, vul aan uit secondary als leeg
    email: primary.email || secondary.email || undefined,
    telefoon: primary.telefoon || secondary.telefoon || undefined,
    wie: primary.wie || secondary.wie || undefined,
    // Inhoud
    bericht: primary.bericht || secondary.bericht || undefined,
    notities: [primary.notities, secondary.notities].filter(Boolean).join('\n---\n') || undefined,
    concept_antwoord: primary.concept_antwoord || secondary.concept_antwoord || undefined,
    // Graph threading
    graph_message_id: primary.graph_message_id || secondary.graph_message_id || undefined,
    graph_conversation_id: primary.graph_conversation_id || secondary.graph_conversation_id || undefined,
    // Gecombineerde data
    klant_reacties: reactiesDedup,
    contactmomenten: momentenDedup as Lead['contactmomenten'],
    status,
  };

  // Pas primary bij en archiveer secondary
  const { error: updateErr } = await supabaseAdmin
    .from('leads')
    .update(merged)
    .eq('id', primary.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const { error: archErr } = await supabaseAdmin
    .from('leads')
    .update({ gearchiveerd: true })
    .eq('id', secondary.id);
  if (archErr) return NextResponse.json({ error: archErr.message }, { status: 500 });

  const { data: result } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', primary.id)
    .single();

  return NextResponse.json({ ok: true, primary: result, secondaryId: secondary.id });
}
