// POST /api/uitgaande-facturen/[id]/akkoord-verstuur
// Boekt de factuur DEFINITIEF (final) in Twinfield → Twinfield kent het factuurnummer toe.
// IDEMPOTENT: boeken gebeurt exact 1×. Is er al een twinfield_invoice_id, dan retourneren we
// die zonder opnieuw te boeken (zo verbrandt een herhaalde poging nooit een tweede nummer).
// De PDF + mail worden hierna apart afgehandeld (/verzend), zodat een mislukte mail los
// herstartbaar is zonder herboeking.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFacturatie } from '@/lib/apiAuth';
import {
  createTwinfieldFactuur,
  maakNieuweDebiteur,
  readDebiteur,
  bepaalArtikel,
  GROOTBOEK,
  type TwinfieldFactuurRegelInput,
} from '@/lib/twinfield/factuur';
import { syncAutoFactuurNaarHubSpot, koppelDebiteurCodeAanHubSpot } from '@/lib/factuur/hubspot-sync';
import type { FactuurRegel, FactuurType, UitgaandeFactuur } from '@/types/factuur';

export const runtime = 'nodejs';

const HEADERTEXT: Record<FactuurType, (f: UitgaandeFactuur) => string> = {
  auto: (f) => `Verkoop ${f.voertuig?.merk ?? ''} ${f.voertuig?.model ?? ''} ${f.voertuig?.kenteken ?? ''}`.trim(),
  wagenparkbeheer: (f) => `Wagenparkbeheer ${f.periode ?? ''}`.trim(),
  shortlease: (f) => `Shortlease doorbelasting ${f.periode ?? ''}`.trim(),
  werk_derden: () => 'Werk derden',
  diensten_overig: () => 'Diensten',
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFacturatie(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const akkoordDoor = gate.user.email ?? null;

  const { data: f, error } = await supabaseAdmin
    .from('uitgaande_facturen').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!f) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

  const factuur = f as UitgaandeFactuur;

  // Al geboekt? Idempotent: niets opnieuw boeken.
  if (factuur.twinfield_invoice_id) {
    return NextResponse.json({ factuur, alreadyBooked: true });
  }
  if (!factuur.regels?.length) {
    return NextResponse.json({ error: 'Geen factuurregels' }, { status: 400 });
  }

  // Debiteur: gekozen bestaande code (match-modal), expliciet nieuw aanmaken, of — bij creditnota —
  // de debiteur van de bronfactuur. NOOIT meer blind aanmaken.
  const body = await req.json().catch(() => ({}));
  let debiteurCode: string;
  let debiteurNieuw = false; // true = nieuw aangemaakt → factuur-NAW is de bron (niet overschrijven)
  try {
    if (body.debiteurCode) {
      debiteurCode = String(body.debiteurCode);
    } else if (body.maakNieuw) {
      debiteurCode = await maakNieuweDebiteur(factuur.klant_naam ?? '', factuur.hubspot_company_id);
      debiteurNieuw = true;
    } else if (factuur.twinfield_debiteur_code) {
      debiteurCode = factuur.twinfield_debiteur_code;
    } else {
      return NextResponse.json({ error: 'Geen debiteur gekozen (debiteurCode of maakNieuw vereist)' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Debiteur Twinfield: ${String(e)}` }, { status: 502 });
  }

  // Twinfield is leidend: bij een BESTAANDE debiteur de NAW uit Twinfield overnemen op de factuur
  // (overschrijft waar Twinfield een waarde heeft, factuur vult de gaten). Zo staat op de PDF altijd
  // het adres zoals het in Twinfield bekend is. Bij een nieuw aangemaakte debiteur is de factuur de bron.
  const naw = {
    klant_naam: factuur.klant_naam ?? null,
    adres: factuur.adres ?? null,
    postcode: factuur.postcode ?? null,
    plaats: factuur.plaats ?? null,
    kvk: factuur.kvk ?? null,
    btw_nummer: factuur.btw_nummer ?? null,
  };
  if (!debiteurNieuw) {
    const tf = await readDebiteur(debiteurCode).catch(() => null);
    if (tf) {
      naw.klant_naam = tf.naam || naw.klant_naam;
      naw.adres = tf.adres || naw.adres;
      naw.postcode = tf.postcode || naw.postcode;
      naw.plaats = tf.plaats || naw.plaats;
      naw.kvk = tf.kvk || naw.kvk;
      naw.btw_nummer = tf.btw || naw.btw_nummer;
    }
  }

  // Regels → Twinfield: boeken op ARTIKELCODE (type + marge/handel + intracommunautair).
  // intra = buitenlands (niet-NL) btw-nummer → buitenland-artikelen (ICP 0%, marge blijft VN).
  const btwNr = (naw.btw_nummer ?? '').trim();
  const intra = btwNr !== '' && !btwNr.toUpperCase().startsWith('NL');
  const tfRegels: TwinfieldFactuurRegelInput[] = (factuur.regels as FactuurRegel[]).map((r) => {
    const isBpm = (r.omschrijving ?? '').trim().toUpperCase() === 'BPM';
    const article = bepaalArtikel({
      type: factuur.type,
      handelsconditie: factuur.handelsconditie ?? false,
      intra,
      btw_code: r.btw_code,
      isBpm,
    });
    return {
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs_excl: r.prijs_excl,
      btw_code: r.btw_code,
      grootboek: r.grootboek || GROOTBOEK[factuur.type] || GROOTBOEK.diensten_overig,
      article: article || undefined, // leeg (BPM zonder artikel) → los artikel fallback
    };
  });

  const datum = new Date();
  const res = await createTwinfieldFactuur({
    debiteurCode,
    regels: tfRegels,
    status: 'final',
    factuurdatum: datum,
    betaaltermijnDagen: factuur.betaaltermijn_dagen ?? 14,
    headertext: HEADERTEXT[factuur.type](factuur),
    credit: factuur.soort === 'creditnota',
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? 'Twinfield-boeking mislukt' }, { status: 502 });
  }

  // Nummer + debiteur opslaan VÓÓR PDF/mail (idempotentie-anker)
  const vervaldatum = new Date(datum);
  vervaldatum.setDate(vervaldatum.getDate() + (factuur.betaaltermijn_dagen ?? 14));
  const { data: updated, error: upErr } = await supabaseAdmin
    .from('uitgaande_facturen')
    .update({
      status: 'definitief',
      factuurnummer: res.invoice_id ?? null,
      twinfield_invoice_id: res.invoice_id ?? null,
      twinfield_debiteur_code: debiteurCode,
      // Twinfield-leidende NAW (overgenomen bij bestaande debiteur) → komt zo ook op de PDF.
      klant_naam: naw.klant_naam,
      adres: naw.adres,
      postcode: naw.postcode,
      plaats: naw.plaats,
      kvk: naw.kvk,
      btw_nummer: naw.btw_nummer,
      factuurdatum: datum.toISOString().slice(0, 10),
      vervaldatum: vervaldatum.toISOString().slice(0, 10),
      akkoord_door: akkoordDoor,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Schrijf het gebruikte debiteurnummer terug naar de JUISTE HubSpot-klant (company vinden/aanmaken),
  // zodat een volgende factuur direct op deze debiteur matcht. Geldt voor zowel gekozen als nieuw
  // aangemaakte debiteuren; niet voor creditnota's (die erven de debiteur van de bron).
  if (factuur.soort !== 'creditnota') {
    try {
      const cid = await koppelDebiteurCodeAanHubSpot(updated as UitgaandeFactuur, debiteurCode);
      if (cid && !factuur.hubspot_company_id) {
        await supabaseAdmin.from('uitgaande_facturen').update({ hubspot_company_id: cid }).eq('id', id);
      }
    } catch { /* niet fataal: Twinfield-boeking is al gelukt */ }
  }

  // Houd de debiteuren-zoekindex actueel: voeg deze debiteur (incl. NAW) meteen toe/bij.
  void supabaseAdmin.from('twinfield_debiteuren').upsert({
    code: debiteurCode,
    naam: naw.klant_naam ?? null,
    adres: naw.adres ?? null,
    postcode: naw.postcode || '',
    plaats: naw.plaats ?? null,
    huisnummer: naw.adres?.match(/\d+/)?.[0] ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'code' });

  // Auto-verkoopfactuur → HubSpot bijwerken (deal op rijdend + RDW-velden), net als documentenstroom.
  // UITZONDERING: handelsverkopen via CarCollect NIET in HubSpot zetten — die auto's hoeven daar niet
  // te staan (geen deal, niet op rijdend), dat zou vervuiling geven. De debiteur (company) is hierboven
  // al bijgewerkt via koppelDebiteurCodeAanHubSpot.
  let hubspot: { dealId?: string; error?: string } = {};
  if (factuur.type === 'auto' && factuur.soort !== 'creditnota' && factuur.bron !== 'carcollect') {
    try {
      const sync = await syncAutoFactuurNaarHubSpot(updated as UitgaandeFactuur);
      if (sync.dealId) {
        hubspot = { dealId: sync.dealId };
        await supabaseAdmin.from('uitgaande_facturen')
          .update({ hubspot_deal_id: sync.dealId, hubspot_synced_at: new Date().toISOString() })
          .eq('id', id);
      }
    } catch (e) {
      hubspot = { error: String(e) }; // niet fataal: Twinfield-boeking is al gelukt
    }
  }

  return NextResponse.json({ factuur: updated, hubspot });
}
