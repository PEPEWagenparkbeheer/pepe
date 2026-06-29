// POST /api/werk-derden/factureren
// Body: { id, marge_type: 'pct'|'bedrag', marge_waarde: number, btw_pct?: number, opmerking?: string }
// Vereiste status: 'klaar_gemeld'
// 1. Haal de melding op uit Supabase
// 2. Bereken verkoop_bedrag uit inkoop + marge
// 3. Zet een CONCEPT-factuur klaar in de facturatie-module (uitgaande_facturen, type 'werk_derden')
// 4. Update status → 'gefactureerd' + marge + verkoop + gefactureerd_op
// De facturatie-medewerker werkt het concept af (debiteur, controle, versturen).

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { berekenTotalen } from '@/lib/factuur/btw';
import type { FactuurRegel } from '@/types/factuur';
import type { WerkDerdenRecord, WerkRegel } from '@/types';

export const runtime = 'nodejs';

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let body: { id?: string; marge_type?: string; marge_waarde?: number; btw_pct?: number; opmerking?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  const { id, marge_type, marge_waarde } = body;
  const btw_pct = body.btw_pct === 0 ? 0 : (body.btw_pct ?? 21);
  const opmerking = (body.opmerking ?? '').trim();

  if (!id) {
    return NextResponse.json({ error: 'id is vereist' }, { status: 400 });
  }
  if (marge_type !== 'pct' && marge_type !== 'bedrag') {
    return NextResponse.json({ error: 'marge_type moet "pct" of "bedrag" zijn' }, { status: 400 });
  }
  if (typeof marge_waarde !== 'number' || marge_waarde < 0) {
    return NextResponse.json({ error: 'marge_waarde moet een positief getal zijn' }, { status: 400 });
  }

  // Haal de melding op
  const { data: raw, error: fetchErr } = await admin
    .from('werk_derden')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !raw) {
    return NextResponse.json({ error: 'Melding niet gevonden' }, { status: 404 });
  }

  const rec = raw as unknown as WerkDerdenRecord;

  if (rec.status !== 'klaar_gemeld') {
    return NextResponse.json(
      { error: `Kan niet factureren: status is "${rec.status}" (verwacht "klaar_gemeld" — meld de auto eerst klaar)` },
      { status: 409 },
    );
  }

  // Voertuigprijs-meldingen (gekoppeld aan After Sales auto) mogen niet via Twinfield
  // gefactureerd worden — de kosten zitten al in de voertuigprijs. Gebruik 'Afronden'.
  if (rec.after_sales_id || (rec as unknown as Record<string,unknown>).bestemming === 'voertuigprijs') {
    return NextResponse.json(
      { error: 'Voertuigprijs-melding kan niet via Twinfield gefactureerd worden. Gebruik de Afronden-actie.' },
      { status: 409 },
    );
  }

  // Bereken verkoop bedrag
  const inkoop =
    rec.inkoop_bedrag ??
    (rec.regels as WerkRegel[]).reduce((s, r) => s + r.bedrag, 0);

  const verkoop_bedrag =
    marge_type === 'pct'
      ? inkoop * (1 + marge_waarde / 100)
      : inkoop + marge_waarde;

  if (verkoop_bedrag <= 0) {
    return NextResponse.json({ error: 'Berekend verkoopbedrag is niet geldig' }, { status: 400 });
  }

  // Zet een CONCEPT-factuur klaar in de facturatie-module. Eén regel met het verkoopbedrag
  // (incl. marge); de werk-details + opmerking ("aan wie factureren") komen in de notitie.
  const voertuig = rec.kenteken ?? rec.meldcode ?? '';
  const merk = [rec.merk, rec.model].filter(Boolean).join(' ');
  const werkDetails = (rec.regels as WerkRegel[]).map((r) => r.omschrijving).filter(Boolean).join(', ');
  const regels: FactuurRegel[] = [{
    omschrijving: `Werkzaamheden ${voertuig}${merk ? ` ${merk}` : ''} via ${rec.partner}${werkDetails ? ` — ${werkDetails}` : ''}`.trim(),
    aantal: 1,
    prijs_excl: round2(verkoop_bedrag),
    btw_code: btw_pct === 0 ? 'geen' : 'hoog',
  }];
  const totalen = berekenTotalen(regels);
  const notitie = [
    opmerking,
    `Werk derden via ${rec.partner}.`,
    rec.klant ? `Klant: ${rec.klant}.` : '',
  ].filter(Boolean).join(' ');

  const { data: factuur, error: factErr } = await admin
    .from('uitgaande_facturen')
    .insert({
      type: 'werk_derden', soort: 'factuur', status: 'concept',
      klant_naam: rec.klant ?? null,
      regels,
      totaal_excl: totalen.totaal_excl,
      totaal_btw: totalen.totaal_btw,
      totaal_incl: totalen.totaal_incl,
      voertuig: voertuig ? { kenteken: voertuig, merk: rec.merk ?? null, model: rec.model ?? null } : null,
      bron: 'werk_derden',
      notitie,
    })
    .select('id')
    .single();

  if (factErr) {
    return NextResponse.json({ error: `Concept-factuur aanmaken mislukt: ${factErr.message}` }, { status: 500 });
  }

  // Werk-derden record afsluiten → 'gefactureerd'
  const { error: updateErr } = await admin
    .from('werk_derden')
    .update({
      status: 'gefactureerd',
      marge_type,
      marge_waarde,
      btw_pct,
      verkoop_bedrag,
      gefactureerd_op: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, factuur_id: factuur?.id, verkoop_bedrag });
}
