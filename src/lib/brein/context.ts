// src/lib/brein/context.ts
// Bouwt de feiten-context voor een concept: koppelt de berijder (afzender-email)
// aan zijn RIJDENDE voertuig/contract in HubSpot, vult aan met RDW-data (merk,
// APK, catalogusprijs) en levert een directe Google Maps merkdealer-zoeklink.
// Doel: zoveel mogelijk data klaarzetten zodat BREIN geen wedervragen hoeft te stellen.
// Server-only.

import {
  searchContactByEmail, searchDealByKenteken, getDealFields, getContactFields,
  getRijdendeDeals, type RijdendeDeal,
} from '@/lib/hubspot';
import { rdwOpzoeken } from '@/lib/rdw';

function normKenteken(k: string): string {
  return k.replace(/[-\s]/g, '').toUpperCase();
}

/** Directe Google Maps-zoeklink naar merkdealers in de buurt (geen API-key nodig). */
function dealerZoeklink(merk: string, woonplaats: string): string {
  const q = encodeURIComponent(`${merk} dealer ${woonplaats}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

interface RdwExtra { merk?: string; model?: string; apk?: string; catalogusprijs?: number; brandstof?: string }

async function rdwExtra(kenteken: string): Promise<RdwExtra> {
  const rdw = await rdwOpzoeken(kenteken).catch(() => null);
  if (!rdw) return {};
  return {
    merk: rdw.voertuig?.merk,
    model: rdw.voertuig?.handelsbenaming,
    apk: rdw.apkDatum ?? undefined,
    catalogusprijs: rdw.catalogusprijs ?? undefined,
    brandstof: rdw.brandstof ?? undefined,
  };
}

/**
 * Levert context-regels op voor de conceptgenerator.
 * Volgorde: contact → woonplaats → rijdende deal(s) → RDW-verrijking + dealer-zoeklink.
 */
export async function buildBreinContext(opts: {
  afzenderEmail?: string | null;
  kenteken?: string | null;
}): Promise<string[]> {
  const ctx: string[] = [];
  const mailKenteken = opts.kenteken ?? null;
  if (mailKenteken) ctx.push(`Kenteken uit mail: ${mailKenteken}`);

  const contactId = opts.afzenderEmail
    ? await searchContactByEmail(opts.afzenderEmail).catch(() => null)
    : null;

  // Woonplaats eerst (nodig voor de dealer-zoeklink).
  let woonplaats = '';
  if (contactId) {
    const c = await getContactFields(contactId, ['city', 'zip']).catch(() => ({} as Record<string, string>));
    if (c.city) {
      woonplaats = c.city;
      ctx.push(`Woonplaats berijder: ${c.city}${c.zip ? ' (' + c.zip + ')' : ''}`);
    }
  }

  // Bepaal het relevante RIJDENDE voertuig (of meerdere).
  let chosen: RijdendeDeal | null = null;
  let meerdere: RijdendeDeal[] | null = null;
  if (contactId) {
    const rijdend = await getRijdendeDeals(contactId);
    if (rijdend.length === 1) {
      chosen = rijdend[0];
    } else if (rijdend.length > 1) {
      const match = mailKenteken
        ? rijdend.find((d) => normKenteken(d.kenteken) === normKenteken(mailKenteken))
        : null;
      if (match) {
        chosen = match;
      } else {
        // Geen kenteken in de mail: kies het lease-voertuig als dat er één is
        // (de meeste berijdersvragen gaan over de lease-auto).
        const leases = rijdend.filter((d) => /lease|operational/i.test(d.type_aanschaf ?? ''));
        if (leases.length === 1) chosen = leases[0];
        else meerdere = rijdend;
      }
    }
  }
  if (!chosen && !meerdere && mailKenteken) {
    const dId = await searchDealByKenteken(mailKenteken).catch(() => null);
    if (dId) {
      const f = await getDealFields(dId, [
        'dealname', 'leasemaatschappij_goed', 'type_aanschaf', 'brandstof',
        'fiscale_waarde', 'apk_datum', 'winterbanden_in_contract', 'verwachte_einddatum',
      ]).catch(() => ({} as Record<string, string>));
      chosen = {
        id: dId, kenteken: f.dealname ?? mailKenteken, leasemaatschappij: f.leasemaatschappij_goed ?? null,
        type_aanschaf: f.type_aanschaf ?? null, brandstof: f.brandstof ?? null, fiscale_waarde: f.fiscale_waarde ?? null,
        apk_datum: f.apk_datum ?? null, winterbanden_in_contract: f.winterbanden_in_contract ?? null,
        verwachte_einddatum: f.verwachte_einddatum ?? null,
      };
    }
  }

  if (chosen) {
    const r = await rdwExtra(chosen.kenteken);
    const merk = r.merk;
    const apk = chosen.apk_datum || r.apk || null;
    const brandstof = chosen.brandstof || r.brandstof || null;
    const fiscaal = chosen.fiscale_waarde
      ? `€${chosen.fiscale_waarde}`
      : (r.catalogusprijs ? `€${r.catalogusprijs.toLocaleString('nl-NL')}` : null);

    ctx.push(`Voertuig (rijdend): ${chosen.kenteken}${merk ? ` — ${merk}${r.model ? ' ' + r.model : ''}` : ''}`);
    if (chosen.leasemaatschappij) ctx.push(`Leasemaatschappij van de berijder: ${chosen.leasemaatschappij}`);
    if (chosen.type_aanschaf) ctx.push(`Contracttype: ${chosen.type_aanschaf}`);
    if (brandstof) ctx.push(`Brandstof: ${brandstof}`);
    if (fiscaal) ctx.push(`Fiscale waarde/catalogusprijs: ${fiscaal}`);
    if (apk) ctx.push(`APK-datum: ${apk}`);
    if (chosen.winterbanden_in_contract) ctx.push(`Bandenprofiel: ${chosen.winterbanden_in_contract}`);
    if (chosen.verwachte_einddatum) ctx.push(`Einddatum contract: ${chosen.verwachte_einddatum}`);
    if (merk && woonplaats) ctx.push(`Merkdealer-zoeklink (gebruik direct): ${dealerZoeklink(merk, woonplaats)}`);
  } else if (meerdere) {
    ctx.push('Berijder heeft meerdere RIJDENDE voertuigen:');
    for (const d of meerdere) {
      const r = await rdwExtra(d.kenteken);
      const merk = r.merk ?? '';
      const apk = d.apk_datum || r.apk || '';
      const link = merk && woonplaats ? ` — dealer-zoeklink: ${dealerZoeklink(merk, woonplaats)}` : '';
      ctx.push(
        `  • ${d.kenteken}${d.leasemaatschappij ? ' (' + d.leasemaatschappij + ')' : ''}` +
          `${merk ? ' — ' + merk : ''}${apk ? ' — APK ' + apk : ''}${link}`,
      );
    }
    ctx.push('Beantwoord met de gegevens die je hebt; vraag alleen om het kenteken als een actie écht per voertuig verschilt.');
  }

  return ctx;
}
