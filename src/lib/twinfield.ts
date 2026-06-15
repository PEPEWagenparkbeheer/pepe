// src/lib/twinfield.ts
// Twinfield-integratie stub — klaar voor live koppeling zodra credentials beschikbaar zijn.
// PEPE kan in de tussentijd meldingen handmatig verwerken.

export interface TwinfieldFactuurInput {
  werk_derden_id: string;
  kenteken: string;
  klant?: string;
  partner: string;
  regels: { omschrijving: string; bedrag: number }[];
  btw_pct: number;
  verkoop_bedrag: number;   // incl. marge, ex BTW
  notitie?: string;
}

export interface TwinfieldFactuurResult {
  ok: boolean;
  invoice_id?: string;
  error?: string;
}

/**
 * Maak een verkoopfactuur aan in Twinfield.
 * Nu een stub — logt de gegevens en geeft een nep-ID terug.
 * Vervang de body door de echte Twinfield SOAP/REST aanroep.
 */
export async function createTwinfieldInvoice(
  input: TwinfieldFactuurInput,
): Promise<TwinfieldFactuurResult> {
  // TODO: implementeer Twinfield SOAP XML factuurcreatie.
  // Zie: https://accounting.twinfield.com/webservices/documentation
  console.log('[Twinfield STUB] factuur aanmaken:', JSON.stringify(input, null, 2));

  // Simuleer een succesvolle aanmaak:
  const fakeId = `TW-STUB-${Date.now()}`;
  return { ok: true, invoice_id: fakeId };
}
