// POST /api/brein/koppel — extraheert inzetdocument-gegevens en koppelt aan HubSpot.
// Vindt/maakt Contact (berijder), Company (bedrijf), Deal (auto op kenteken).
// Zet deal op rijdend, slaat alle contractdetails op, koppelt associaties.
// Body: { berichtId: string }

import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { extraheertInzetdocument } from '@/lib/brein/inzetdocument';
import {
  searchContactByEmail,
  searchContactByName,
  createContact,
  findCompany,
  searchCompanyByKvk,
  createCompany,
  updateCompany,
  searchDealByKenteken,
  createDeal,
  updateDealFields,
  associateDealContact,
  associateDealCompany,
  associateContactCompany,
  createNoteOnDeal,
  DEALSTAGE_RIJDEND,
} from '@/lib/hubspot';

export const runtime = 'nodejs';

function htmlNaarTekst(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Berekent verwachte einddatum op basis van inzetdatum + looptijd. */
function berekenEinddatum(inzetdatum: string, looptijdMaanden: number): string {
  const d = new Date(inzetdatum);
  d.setMonth(d.getMonth() + looptijdMaanden);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const { berichtId } = await req.json() as { berichtId: string };
    if (!berichtId) return NextResponse.json({ error: 'berichtId ontbreekt' }, { status: 400 });

    // Haal bericht op uit Supabase.
    const { data: bericht, error: fetchErr } = await supabaseAdmin
      .from('brein_messages')
      .select('id, onderwerp, body_html, body_preview, afzender_naam, afzender_email')
      .eq('id', berichtId)
      .maybeSingle();
    if (fetchErr || !bericht) {
      return NextResponse.json({ error: 'Bericht niet gevonden' }, { status: 404 });
    }

    const bodyTekst = htmlNaarTekst(bericht.body_html ?? '') || (bericht.body_preview ?? '');
    const ext = await extraheertInzetdocument(bericht.onderwerp ?? '', bodyTekst);

    const log: string[] = [];

    // ── BERIJDER (Contact) ───────────────────────────────────────
    let contactId: string | null = null;
    const email = ext.berijder_email?.trim().toLowerCase() || null;
    const voornaam = ext.berijder_voornaam?.trim() || null;
    const achternaam = ext.berijder_achternaam?.trim() || null;

    if (email) contactId = await searchContactByEmail(email);
    if (!contactId && voornaam && achternaam) {
      contactId = await searchContactByName(voornaam, achternaam);
    }

    const contactProps = {
      email: email ?? undefined,
      firstname: voornaam ?? undefined,
      lastname: achternaam ?? undefined,
      phone: ext.berijder_telefoon ?? undefined,
      address: ext.berijder_adres ?? undefined,
      city: ext.berijder_stad ?? undefined,
      zip: ext.berijder_postcode ?? undefined,
    };

    if (!contactId) {
      if (email || (voornaam && achternaam)) {
        contactId = await createContact(contactProps);
        log.push(`Contact aangemaakt: ${voornaam ?? ''} ${achternaam ?? ''} (${email ?? 'geen email'})`);
      } else {
        log.push('Geen berijdergegevens gevonden om contact aan te maken.');
      }
    } else {
      log.push(`Contact gevonden: ${contactId}`);
    }

    // ── BEDRIJF (Company) ────────────────────────────────────────
    let companyId: string | null = null;
    if (ext.bedrijf_naam) {
      if (ext.bedrijf_kvk) companyId = await searchCompanyByKvk(ext.bedrijf_kvk);
      if (!companyId) {
        companyId = await findCompany({
          name: ext.bedrijf_naam,
          postcode: ext.bedrijf_postcode,
          plaats: ext.bedrijf_stad,
        });
      }
      if (!companyId) {
        companyId = await createCompany({
          name: ext.bedrijf_naam,
          kvk: ext.bedrijf_kvk ?? undefined,
          address: ext.bedrijf_adres ?? undefined,
          city: ext.bedrijf_stad ?? undefined,
          zip: ext.bedrijf_postcode ?? undefined,
        });
        log.push(`Bedrijf aangemaakt: ${ext.bedrijf_naam}`);
      } else {
        if (ext.bedrijf_kvk || ext.bedrijf_adres) {
          await updateCompany(companyId, {
            kvk: ext.bedrijf_kvk ?? undefined,
            address: ext.bedrijf_adres ?? undefined,
            city: ext.bedrijf_stad ?? undefined,
            zip: ext.bedrijf_postcode ?? undefined,
          });
        }
        log.push(`Bedrijf gevonden: ${ext.bedrijf_naam} (${companyId})`);
      }
    }

    // ── DEAL (Auto op kenteken) ──────────────────────────────────
    let dealId: string | null = null;
    if (ext.kenteken) {
      dealId = await searchDealByKenteken(ext.kenteken);

      // Bereken verwachte einddatum
      const einddatum =
        ext.inzetdatum && ext.looptijd_maanden
          ? berekenEinddatum(ext.inzetdatum, ext.looptijd_maanden)
          : null;

      const dealProperties: Record<string, string> = {
        dealstage: DEALSTAGE_RIJDEND,
      };
      if (ext.merk_model) dealProperties.merk___type = ext.merk_model;
      if (ext.brandstof) dealProperties.brandstof = ext.brandstof;
      if (ext.type_aanschaf) dealProperties.type_aanschaf = ext.type_aanschaf;
      if (ext.fiscale_waarde != null) dealProperties.fiscale_waarde = String(ext.fiscale_waarde);
      if (ext.inzetdatum) dealProperties.inzetdatum = ext.inzetdatum;
      if (einddatum) dealProperties.verwachte_einddatum = einddatum;
      if (ext.leasemaatschappij_naam) dealProperties.leasemaatschappij_goed = ext.leasemaatschappij_naam;
      if (ext.jaarkilometrage != null) dealProperties.kilometerstand_huidig = String(ext.jaarkilometrage);

      if (dealId) {
        await updateDealFields(dealId, dealProperties);
        log.push(`Deal gevonden en bijgewerkt: ${ext.kenteken} → Rijdend`);
      } else {
        dealId = await createDeal({
          kenteken: ext.kenteken,
          merk_type: ext.merk_model ?? undefined,
          brandstof: ext.brandstof ?? undefined,
          type_aanschaf: ext.type_aanschaf ?? undefined,
          fiscale_waarde: ext.fiscale_waarde ?? undefined,
          inzetdatum: ext.inzetdatum ?? undefined,
          dealstage: DEALSTAGE_RIJDEND,
        });
        if (einddatum || ext.leasemaatschappij_naam || ext.jaarkilometrage) {
          await updateDealFields(dealId, dealProperties);
        }
        log.push(`Deal aangemaakt: ${ext.kenteken}`);
      }

      // Associaties leggen
      if (contactId) {
        await associateDealContact(dealId, contactId);
        log.push('Deal gekoppeld aan berijder');
      }
      if (companyId) {
        await associateDealCompany(dealId, companyId);
        log.push('Deal gekoppeld aan bedrijf');
      }

      // Notitie met alle contractdetails op de deal
      const notitieRegels: string[] = ['<b>Inzetdocument verwerkt door BREIN</b><br>'];
      if (ext.contractnummer) notitieRegels.push(`Contractnummer: ${ext.contractnummer}`);
      if (ext.inzetdatum) notitieRegels.push(`Inzetdatum: ${ext.inzetdatum}`);
      if (ext.looptijd_maanden) notitieRegels.push(`Looptijd: ${ext.looptijd_maanden} maanden`);
      if (ext.jaarkilometrage) notitieRegels.push(`Jaarkilometrage: ${ext.jaarkilometrage.toLocaleString('nl-NL')} km`);
      if (ext.fiscale_waarde) notitieRegels.push(`Fiscale waarde: € ${ext.fiscale_waarde.toLocaleString('nl-NL')}`);
      if (ext.leasemaatschappij_naam) {
        notitieRegels.push(`<br><b>Leasemaatschappij:</b> ${ext.leasemaatschappij_naam}`);
        if (ext.leasemaatschappij_referentie) notitieRegels.push(`Referentie: ${ext.leasemaatschappij_referentie}`);
        if (ext.leasemaatschappij_contactpersoon) notitieRegels.push(`Contactpersoon: ${ext.leasemaatschappij_contactpersoon}`);
        if (ext.leasemaatschappij_email) notitieRegels.push(`E-mail: ${ext.leasemaatschappij_email}`);
        if (ext.leasemaatschappij_telefoon) notitieRegels.push(`Telefoon: ${ext.leasemaatschappij_telefoon}`);
      }
      if (ext.berijder_voornaam || ext.berijder_achternaam) {
        notitieRegels.push(`<br><b>Berijder:</b> ${[ext.berijder_voornaam, ext.berijder_achternaam].filter(Boolean).join(' ')}`);
        if (ext.berijder_email) notitieRegels.push(`E-mail: ${ext.berijder_email}`);
        if (ext.berijder_adres) notitieRegels.push(`Adres: ${ext.berijder_adres}, ${ext.berijder_postcode ?? ''} ${ext.berijder_stad ?? ''}`);
      }
      if (ext.bedrijf_naam) {
        notitieRegels.push(`<br><b>Bedrijf:</b> ${ext.bedrijf_naam}`);
        if (ext.bedrijf_kvk) notitieRegels.push(`KvK: ${ext.bedrijf_kvk}`);
      }
      await createNoteOnDeal(dealId, notitieRegels.join('<br>'));
      log.push('Notitie aangemaakt op deal');
    } else {
      log.push('Geen kenteken gevonden — deal niet aangemaakt.');
    }

    // Koppel contact aan bedrijf
    if (contactId && companyId) {
      await associateContactCompany(contactId, companyId);
      log.push('Berijder gekoppeld aan bedrijf');
    }

    // Markeer bericht als afgehandeld in Brein
    await supabaseAdmin
      .from('brein_messages')
      .update({ status: 'afgehandeld', verwerkt_op: new Date().toISOString() })
      .eq('id', berichtId);

    return NextResponse.json({
      ok: true,
      log,
      extract: ext,
      hubspot: { contactId, companyId, dealId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brein/koppel] fout:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
