import { createHash } from 'crypto';

const TC_BASE_URL = (
  process.env.TRANSCONNECT_BASE_URL ??
  process.env.TRANSCONNECT_API_BASE_URL ??
  'https://login.transconnect.com'
).replace(/\/+$/, '');
const TC_API_KEY =
  process.env.TRANSCONNECT_API_KEY ??
  process.env.TRANS_CONNECT_API_KEY ??
  process.env.TC_API_KEY ??
  '';
const TC_COMPANY_NAME =
  process.env.TRANSCONNECT_COMPANY_NAME ??
  process.env.TRANSCONNECT_API_NAME ??
  process.env.TRANS_CONNECT_COMPANY_NAME ??
  process.env.TC_COMPANY_NAME ??
  'pepe';

// JWT token cache — tokens worden 55 minuten gecached
let tokenCache: { token: string; expires: number } | null = null;

async function getJwtToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token;
  if (!TC_API_KEY) {
    throw new Error('TransConnect API key ontbreekt. Zet TRANSCONNECT_API_KEY in de omgeving.');
  }

  const sha1Key = createHash('sha1').update(TC_API_KEY).digest('hex');
  const url = `${TC_BASE_URL}/twapi/v2/generateApiToken/?key=${encodeURIComponent(sha1Key)}&client=${encodeURIComponent(TC_COMPANY_NAME)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TransConnect auth mislukt: ${res.status}`);

  // TC geeft de token terug als plain text of als JSON { token: "..." }
  const text = await res.text();
  let token: string;
  try {
    const json = JSON.parse(text);
    token = json.token ?? json.jwt ?? json.access_token ?? text.trim();
  } catch {
    token = text.trim();
  }

  tokenCache = { token, expires: Date.now() + 55 * 60 * 1000 };
  return token;
}

// Registreer de webhook-URL bij TransConnect (eenmalig uitvoeren).
// TC roept daarna onze callbackUrl aan bij elke statuswijziging.
export async function registerWebhook(callbackUrl: string): Promise<void> {
  const token = await getJwtToken();
  const url = `${TC_BASE_URL}/twapi/v2/subscribeOrderChanges/?callback_url=${encodeURIComponent(callbackUrl)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Webhook registratie mislukt: ${res.status} — ${body}`);
  }
}

// Haal de huidige status op van een bestaande order (voor handmatige checks).
export async function getOrderStatus(orderId: string | number): Promise<Record<string, unknown>> {
  const token = await getJwtToken();
  const res = await fetch(`${TC_BASE_URL}/twapi/v2/getOrder/?order_id=${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`TransConnect getOrder mislukt: ${res.status}`);
  return res.json();
}

// TC geeft lege velden terug als "" (niet null). Normaliseer naar undefined en
// kap datums af op YYYY-MM-DD, zodat we lege waarden niet als datum opslaan.
function tcDate(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 10) : undefined;
}

export interface TcOrderPatch {
  transport_status: string;
  transport_status_updated_at: string;
  aangevraagd: true;
  transportdatum?: string;        // geplande LEVERdatum/aankomst (planned_arrival_date)
  geplande_afhaaldatum?: string;  // geplande AFHAALdatum/ophalen (planned_pickup_date) — betaal-trigger
  binnen?: boolean;
  binnen_op?: string;
}

// Vertaalt een TC order- of webhook-payload naar de PEPE-velden in after_sales.
// Velden die ontbreken of leeg ("") zijn worden weggelaten, zodat een webhook die
// niet alle velden meestuurt bestaande waarden niet overschrijft. Bevestigde
// TC-veldnamen (getOrder): planned_pickup_date = afhaal, planned_arrival_date = lever,
// arrival_date = daadwerkelijk aangekomen.
export function mapTcOrderToPatch(order: Record<string, unknown>): TcOrderPatch {
  const rawStatus = String(order.order_status ?? order.status ?? order.state ?? '').trim();
  const status = rawStatus.toLowerCase();

  const plannedArrival = tcDate(order.planned_arrival_date ?? order.planned_delivery_date);
  const plannedPickup = tcDate(order.planned_pickup_date);
  const arrival = tcDate(order.arrival_date ?? order.delivery_date ?? order.delivered_date);

  const patch: TcOrderPatch = {
    transport_status: rawStatus,
    transport_status_updated_at: new Date().toISOString(),
    aangevraagd: true,
  };

  if (plannedArrival) patch.transportdatum = plannedArrival;
  if (plannedPickup) patch.geplande_afhaaldatum = plannedPickup;

  // binnen = auto daadwerkelijk aangekomen/gelost (arrival_date gevuld of status zegt het)
  const isBinnen = !!arrival ||
    status.includes('delivered') || status.includes('afgeleverd') ||
    status.includes('aangekomen') || status.includes('gelost') || status.includes('unloaded');
  if (isBinnen) {
    patch.binnen = true;
    patch.binnen_op = arrival ?? new Date().toISOString().slice(0, 10);
  }

  return patch;
}
