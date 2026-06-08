// Microsoft Graph authenticatie via client credentials flow (app-only).

export interface AzureConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

export interface TokenResult {
  accessToken: string
  expiresIn: number
}

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

/**
 * Leest de Azure-credentials uit omgevingsvariabelen en valideert ze.
 */
export function readAzureConfig(): AzureConfig {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  const missing: string[] = []
  if (!tenantId) missing.push('AZURE_TENANT_ID')
  if (!clientId) missing.push('AZURE_CLIENT_ID')
  if (!clientSecret) missing.push('AZURE_CLIENT_SECRET')

  if (missing.length > 0) {
    throw new Error(
      `Ontbrekende omgevingsvariabelen: ${missing.join(', ')}. Controleer het .env bestand.`
    )
  }

  return { tenantId: tenantId!, clientId: clientId!, clientSecret: clientSecret! }
}

/**
 * Vraagt een app-only access token op bij Microsoft Entra ID.
 */
export async function getAccessToken(config: AzureConfig): Promise<TokenResult> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: 'client_credentials',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await response.json()) as Record<string, unknown>

  if (!response.ok) {
    const detail =
      (data?.error_description as string) ||
      (data?.error as string) ||
      'onbekende fout'
    throw new Error(`Token ophalen mislukt (HTTP ${response.status}): ${detail}`)
  }

  return {
    accessToken: data.access_token as string,
    expiresIn: data.expires_in as number,
  }
}
