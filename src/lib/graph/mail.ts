// Microsoft Graph mailbox helpers (app-only).

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export interface GraphMessage {
  id: string
  subject: string
  afzenderEmail: string
  afzenderNaam: string
  ontvangenOp: string
  bodyPreview: string
  bodyHtml: string
  isRead: boolean
}

interface GraphApiMessage {
  id: string
  subject: string | null
  from: { emailAddress: { address: string; name: string } } | null
  receivedDateTime: string
  bodyPreview: string | null
  body: { content: string; contentType: string } | null
  isRead: boolean
}

interface GraphListResponse {
  value: GraphApiMessage[]
  '@odata.nextLink'?: string
  error?: { message: string }
}

/**
 * Haalt recente berichten op uit een mailbox via Graph API.
 * Selecteert body inclusief HTML voor Claude-analyse.
 *
 * @param accessToken  App-only Graph access token
 * @param mailbox      UPN / e-mailadres van de doelmailbox
 * @param top          Aantal op te halen berichten (max 50)
 */
export async function getRecentMessages(
  accessToken: string,
  mailbox: string,
  top = 20
): Promise<GraphMessage[]> {
  const select = 'id,subject,from,receivedDateTime,bodyPreview,body,isRead'
  // Alleen het Postvak IN (inkomende berijdersmails), niet Verzonden/andere mappen.
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
    `?$top=${top}&$select=${select}&$orderby=receivedDateTime desc`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = (await response.json()) as GraphListResponse

  if (!response.ok) {
    const detail = data?.error?.message ?? 'onbekende fout'
    throw new Error(`Mailbox lezen mislukt (HTTP ${response.status}): ${detail}`)
  }

  return (data.value ?? []).map((msg) => ({
    id: msg.id,
    subject: msg.subject ?? '(geen onderwerp)',
    afzenderEmail: msg.from?.emailAddress?.address ?? '(onbekend)',
    afzenderNaam: msg.from?.emailAddress?.name ?? '',
    ontvangenOp: msg.receivedDateTime,
    bodyPreview: msg.bodyPreview ?? '',
    bodyHtml: msg.body?.content ?? '',
    isRead: msg.isRead,
  }))
}

/**
 * Haalt recente VERZONDEN berichten op (map "Verzonden items").
 * Gebruikt voor tone-of-voice: live ingelezen als stijlvoorbeeld, niet opgeslagen.
 */
export async function getSentMessages(
  accessToken: string,
  mailbox: string,
  top = 8
): Promise<{ subject: string; bodyPreview: string }[]> {
  const select = 'subject,bodyPreview,receivedDateTime'
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages` +
    `?$top=${top}&$select=${select}&$orderby=receivedDateTime desc`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await response.json()) as GraphListResponse

  if (!response.ok) {
    const detail = data?.error?.message ?? 'onbekende fout'
    throw new Error(`Verzonden items lezen mislukt (HTTP ${response.status}): ${detail}`)
  }

  return (data.value ?? []).map((msg) => ({
    subject: msg.subject ?? '',
    bodyPreview: msg.bodyPreview ?? '',
  }))
}

/**
 * Haalt een enkel bericht op inclusief volledige body.
 */
export async function getMessage(
  accessToken: string,
  mailbox: string,
  messageId: string
): Promise<GraphMessage> {
  const select = 'id,subject,from,receivedDateTime,bodyPreview,body,isRead'
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `?$select=${select}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const msg = (await response.json()) as GraphApiMessage & { error?: { message: string } }

  if (!response.ok) {
    const detail = (msg as unknown as { error?: { message: string } })?.error?.message ?? 'onbekende fout'
    throw new Error(`Bericht ophalen mislukt (HTTP ${response.status}): ${detail}`)
  }

  return {
    id: msg.id,
    subject: msg.subject ?? '(geen onderwerp)',
    afzenderEmail: msg.from?.emailAddress?.address ?? '(onbekend)',
    afzenderNaam: msg.from?.emailAddress?.name ?? '',
    ontvangenOp: msg.receivedDateTime,
    bodyPreview: msg.bodyPreview ?? '',
    bodyHtml: msg.body?.content ?? '',
    isRead: msg.isRead,
  }
}

/**
 * Verstuurt een reply op een bestaand bericht.
 * Vereist Mail.Send permissie op de app-registratie.
 */
export async function replyToMessage(
  accessToken: string,
  mailbox: string,
  messageId: string,
  comment: string
): Promise<void> {
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/reply`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment }),
  })

  if (!response.ok) {
    const data = (await response.json()) as { error?: { message: string } }
    const detail = data?.error?.message ?? 'onbekende fout'
    throw new Error(`Reply versturen mislukt (HTTP ${response.status}): ${detail}`)
  }
}
