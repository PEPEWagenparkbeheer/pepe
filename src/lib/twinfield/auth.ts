import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  readTwinfieldConfig,
  TWINFIELD_AUTHORIZE_URL,
  TWINFIELD_SCOPES,
  TWINFIELD_TOKEN_URL,
  TWINFIELD_VALIDATION_URL,
} from './config';

export interface TwinfieldTokenRow {
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires: string | null;
  cluster_url: string | null;
  company_code: string | null;
  connected_by: string | null;
  connected_at: string | null;
}

export interface ValidToken {
  accessToken: string;
  clusterUrl: string;
  companyCode: string | null;
}

export class TwinfieldAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_connected' | 'refresh_failed' | 'config_missing',
  ) {
    super(message);
    this.name = 'TwinfieldAuthError';
  }
}

export function buildAuthorizeUrl(state: string, nonce: string): string {
  const config = readTwinfieldConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: TWINFIELD_SCOPES,
    redirect_uri: config.redirectUri,
    state,
    nonce,
  });
  return `${TWINFIELD_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const config = readTwinfieldConfig();
  const res = await fetch(TWINFIELD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token-uitwisseling mislukt (${res.status}): ${err}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
  };
}

export async function resolveCluster(accessToken: string): Promise<string> {
  const res = await fetch(`${TWINFIELD_VALIDATION_URL}?token=${encodeURIComponent(accessToken)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Cluster-resolutie mislukt (${res.status})`);
  const data = (await res.json()) as Record<string, unknown>;
  const clusterUrl = data['twf.clusterUrl'] as string | undefined;
  if (!clusterUrl) throw new Error('twf.clusterUrl ontbreekt in validatierespons');
  return clusterUrl;
}

async function refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
  const { data: row } = await supabaseAdmin
    .from('twinfield_auth')
    .select('refresh_token')
    .eq('id', 'singleton')
    .single();

  if (!row?.refresh_token) {
    throw new TwinfieldAuthError('Geen refresh-token opgeslagen', 'not_connected');
  }

  const config = readTwinfieldConfig();
  const res = await fetch(TWINFIELD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes('invalid_request') || err.includes('invalid_grant')) {
      throw new TwinfieldAuthError(
        'Twinfield-koppeling verlopen of ingetrokken — opnieuw koppelen vereist',
        'refresh_failed',
      );
    }
    throw new Error(`Token-verversing mislukt (${res.status}): ${err}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    expiresIn: data.expires_in as number,
  };
}

export async function storeTokens({
  accessToken,
  refreshToken,
  expiresIn,
  clusterUrl,
  connectedBy,
}: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  clusterUrl: string;
  connectedBy: string;
}): Promise<void> {
  const expires = new Date(Date.now() + expiresIn * 1000).toISOString();
  await supabaseAdmin.from('twinfield_auth').upsert({
    id: 'singleton',
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires: expires,
    cluster_url: clusterUrl,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
}

export async function getValidAccessToken(): Promise<ValidToken> {
  const { data: row } = await supabaseAdmin
    .from('twinfield_auth')
    .select('*')
    .eq('id', 'singleton')
    .single();

  if (!row?.refresh_token) {
    throw new TwinfieldAuthError('Twinfield niet gekoppeld', 'not_connected');
  }

  const now = Date.now();
  const expiresAt = row.access_token_expires
    ? new Date(row.access_token_expires).getTime()
    : 0;
  const fiveMinutes = 5 * 60 * 1000;

  let accessToken = row.access_token as string;

  if (!accessToken || expiresAt - now < fiveMinutes) {
    const refreshed = await refreshAccessToken();
    accessToken = refreshed.accessToken;
    const newExpires = new Date(now + refreshed.expiresIn * 1000).toISOString();
    await supabaseAdmin.from('twinfield_auth').update({
      access_token: accessToken,
      access_token_expires: newExpires,
    }).eq('id', 'singleton');
  }

  if (!row.cluster_url) {
    throw new TwinfieldAuthError('Cluster-URL ontbreekt — opnieuw koppelen', 'not_connected');
  }

  return {
    accessToken,
    clusterUrl: row.cluster_url as string,
    companyCode: (row.company_code as string | null) ?? null,
  };
}

export async function getStatus(): Promise<TwinfieldTokenRow | null> {
  const { data } = await supabaseAdmin
    .from('twinfield_auth')
    .select('refresh_token, access_token, access_token_expires, cluster_url, company_code, connected_by, connected_at')
    .eq('id', 'singleton')
    .single();
  if (!data?.refresh_token) return null;
  return data as TwinfieldTokenRow;
}

export async function disconnect(): Promise<void> {
  await supabaseAdmin.from('twinfield_auth').update({
    refresh_token: null,
    access_token: null,
    access_token_expires: null,
    cluster_url: null,
    connected_by: null,
    connected_at: null,
  }).eq('id', 'singleton');
}
