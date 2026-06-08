// POST /api/brein/sync
// Haalt recente berichten op uit de Graph API en slaat nieuwe op in Supabase.
// Auth via ?secret= query parameter (zelfde patroon als andere inbound-routes).
//
// Aanroepen: via Vercel cron of handmatig via de BREIN UI.

import { NextRequest, NextResponse } from 'next/server'
import { readAzureConfig, getAccessToken, getRecentMessages } from '@/lib/graph'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const BREIN_SYNC_SECRET = process.env.BREIN_SYNC_SECRET ?? ''
const TARGET_MAILBOX = process.env.BREIN_MAILBOX ?? ''

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.nextUrl.searchParams.get('secret')
  if (!BREIN_SYNC_SECRET || secret !== BREIN_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!TARGET_MAILBOX) {
    return NextResponse.json(
      { error: 'BREIN_MAILBOX env var is niet geconfigureerd' },
      { status: 500 }
    )
  }

  try {
    // 1. Graph token ophalen
    const config = readAzureConfig()
    const { accessToken } = await getAccessToken(config)

    // 2. Laatste 50 berichten ophalen
    const messages = await getRecentMessages(accessToken, TARGET_MAILBOX, 50)

    if (messages.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0 })
    }

    // 3. Controleer welke graph_message_id's al bestaan
    const graphIds = messages.map((m) => m.id)
    const { data: existing } = await supabaseAdmin
      .from('brein_messages')
      .select('graph_message_id')
      .in('graph_message_id', graphIds)

    const existingIds = new Set((existing ?? []).map((r) => r.graph_message_id))

    // 4. Filter op nieuwe berichten
    const newMessages = messages.filter((m) => !existingIds.has(m.id))

    if (newMessages.length === 0) {
      return NextResponse.json({ synced: 0, skipped: messages.length })
    }

    // 5. Nieuwe berichten invoegen
    const rows = newMessages.map((m) => ({
      graph_message_id: m.id,
      mailbox: TARGET_MAILBOX,
      onderwerp: m.subject,
      afzender_email: m.afzenderEmail,
      afzender_naam: m.afzenderNaam,
      ontvangen_op: m.ontvangenOp,
      body_preview: m.bodyPreview,
      body_html: m.bodyHtml,
      status: 'nieuw',
    }))

    const { error } = await supabaseAdmin.from('brein_messages').insert(rows)

    if (error) {
      console.error('[brein/sync] Supabase insert fout:', error)
      return NextResponse.json(
        { error: 'Database insert mislukt', detail: error.message },
        { status: 500 }
      )
    }

    console.log(`[brein/sync] ${newMessages.length} nieuwe berichten opgeslagen, ${existingIds.size} overgeslagen`)

    return NextResponse.json({
      synced: newMessages.length,
      skipped: existingIds.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[brein/sync] Fout:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
