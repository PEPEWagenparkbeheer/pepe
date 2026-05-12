import type { AfterSalesAuto } from '@/types';

// Vul in na ontvangst van TransConnect sandbox-documentatie
const TC_API_URL = process.env.TRANSCONNECT_API_URL ?? 'https://api.transconnect.com/v1';
const TC_API_KEY = process.env.TRANSCONNECT_API_KEY ?? '';

export interface TransportOrderResult {
  order_id: string;
  status: string;
  geplande_datum?: string;
}

export interface TransportStatusResult {
  order_id: string;
  status: string;
  geplande_datum?: string;
  aankomst_datum?: string;
}

// Plaats een transportorder bij TransConnect.
// Exacte velden worden ingevuld zodra sandbox-documentatie beschikbaar is.
export async function maakTransportOrder(auto: AfterSalesAuto): Promise<TransportOrderResult> {
  const res = await fetch(`${TC_API_URL}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TC_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // TODO: vul exacte veldnamen in na sandbox-docs
      kenteken: auto.kenteken,
      merk: auto.merk,
      model: auto.model,
      klant: auto.klant,
    }),
  });
  if (!res.ok) throw new Error(`TransConnect order mislukt: ${res.status}`);
  return res.json();
}

// Haal de huidige status op van een bestaande transportorder.
export async function getTransportStatus(order_id: string): Promise<TransportStatusResult> {
  const res = await fetch(`${TC_API_URL}/orders/${order_id}`, {
    headers: { 'Authorization': `Bearer ${TC_API_KEY}` },
  });
  if (!res.ok) throw new Error(`TransConnect status ophalen mislukt: ${res.status}`);
  return res.json();
}
