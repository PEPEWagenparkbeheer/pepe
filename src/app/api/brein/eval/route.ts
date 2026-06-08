// POST /api/brein/eval  (DEV/TEST)
// Genereert een concept voor een INLINE scenario (zonder DB), voor batch-testen
// van de beslislogica. Auth: ?secret=BREIN_SYNC_SECRET
// Body: { onderwerp, body, categorie?, afzenderEmail?, kenteken? }

import { NextRequest, NextResponse } from 'next/server';
import { genereerConcept } from '@/lib/brein/concept';
import { PEPE_PROCEDURES } from '@/lib/brein/kennis';
import { getDealFields, getContactFields, searchContactByEmail, searchDealByKenteken } from '@/lib/hubspot';
import { rdwOpzoeken } from '@/lib/rdw';

export const runtime = 'nodejs';
const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? '';

const EMPTY: Record<string, string> = {};

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== BREIN_SYNC_SECRET || !BREIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = (await req.json()) as {
    onderwerp?: string; body?: string; categorie?: string;
    afzenderEmail?: string; kenteken?: string;
  };

  const contextDelen: string[] = [];
  if (s.kenteken) contextDelen.push(`Kenteken: ${s.kenteken}`);

  const contactId = s.afzenderEmail ? await searchContactByEmail(s.afzenderEmail).catch(() => null) : null;
  const dealId = s.kenteken ? await searchDealByKenteken(s.kenteken).catch(() => null) : null;

  if (dealId) {
    const f = await getDealFields(dealId, [
      'leasemaatschappij_goed', 'type_aanschaf', 'brandstof', 'fiscale_waarde',
      'apk_datum', 'winterbanden_in_contract', 'verwachte_einddatum',
    ]).catch(() => EMPTY);
    if (f.leasemaatschappij_goed) contextDelen.push(`Leasemaatschappij van de berijder: ${f.leasemaatschappij_goed}`);
    if (f.type_aanschaf) contextDelen.push(`Contracttype: ${f.type_aanschaf}`);
    if (f.brandstof) contextDelen.push(`Brandstof: ${f.brandstof}`);
    if (f.fiscale_waarde) contextDelen.push(`Fiscale waarde: ${f.fiscale_waarde}`);
    if (f.apk_datum) contextDelen.push(`APK-datum: ${f.apk_datum}`);
    if (f.winterbanden_in_contract) contextDelen.push(`Bandenprofiel: ${f.winterbanden_in_contract}`);
    if (f.verwachte_einddatum) contextDelen.push(`Einddatum contract: ${f.verwachte_einddatum}`);
  }
  if (contactId) {
    const c = await getContactFields(contactId, ['city', 'zip']).catch(() => EMPTY);
    if (c.city) contextDelen.push(`Woonplaats berijder: ${c.city}${c.zip ? ' (' + c.zip + ')' : ''}`);
  }

  // RDW-fallback: APK-datum, catalogusprijs en brandstof ophalen als HubSpot die niet heeft.
  if (s.kenteken) {
    const heeftApk = contextDelen.some(d => d.startsWith('APK-datum'));
    const heeftFiscaal = contextDelen.some(d => d.startsWith('Fiscale waarde'));
    const heeftBrandstof = contextDelen.some(d => d.startsWith('Brandstof'));
    if (!heeftApk || !heeftFiscaal || !heeftBrandstof) {
      const rdw = await rdwOpzoeken(s.kenteken).catch(() => null);
      if (rdw) {
        if (!heeftApk && rdw.apkDatum) contextDelen.push(`APK-datum (RDW): ${rdw.apkDatum}`);
        if (!heeftFiscaal && rdw.catalogusprijs) {
          contextDelen.push(`Catalogusprijs/fiscale waarde (RDW): €${rdw.catalogusprijs.toLocaleString('nl-NL')}`);
        }
        if (!heeftBrandstof && rdw.brandstof) contextDelen.push(`Brandstof (RDW): ${rdw.brandstof}`);
      }
    }
  }

  try {
    const concept = await genereerConcept({
      onderwerp: s.onderwerp ?? null,
      afzenderNaam: null,
      afzenderEmail: s.afzenderEmail ?? null,
      categorie: s.categorie ?? null,
      body: s.body ?? '',
      stijlvoorbeelden: [], // eval test de INHOUD/het proces, niet de toon
      context: contextDelen.join('\n') || undefined,
      procedures: PEPE_PROCEDURES,
    });
    return NextResponse.json({ concept, context: contextDelen });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
