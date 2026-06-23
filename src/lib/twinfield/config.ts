export const TWINFIELD_AUTHORIZE_URL =
  'https://login.twinfield.com/auth/authentication/connect/authorize';

export const TWINFIELD_TOKEN_URL =
  'https://login.twinfield.com/auth/authentication/connect/token';

export const TWINFIELD_VALIDATION_URL =
  'https://login.twinfield.com/auth/authentication/connect/accesstokenvalidation';

export const TWINFIELD_SCOPES =
  'openid twf.user twf.organisation twf.organisationUser offline_access';

export interface TwinfieldConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function readTwinfieldConfig(): TwinfieldConfig {
  const clientId = process.env.TWINFIELD_CLIENT_ID?.trim();
  const clientSecret = process.env.TWINFIELD_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TWINFIELD_REDIRECT_URI?.trim();

  if (!clientId) throw new Error('TWINFIELD_CLIENT_ID ontbreekt in environment');
  if (!clientSecret) throw new Error('TWINFIELD_CLIENT_SECRET ontbreekt in environment');
  if (!redirectUri) throw new Error('TWINFIELD_REDIRECT_URI ontbreekt in environment');

  return { clientId, clientSecret, redirectUri };
}

export function basicAuthHeader(config: TwinfieldConfig): string {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  return `Basic ${credentials}`;
}
