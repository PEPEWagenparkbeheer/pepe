// GET /api/brein/messages
// Haalt BREIN-berichten op uit Supabase voor de inbox UI.
// Ondersteunt filtering op status en paginering.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'nieuw'
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '25', 10))
  const offset = page * limit

  let query = supabaseAdmin
    .from('brein_messages')
    .select(
      'id,graph_message_id,onderwerp,afzender_email,afzender_naam,ontvangen_op,body_preview,categorie,prioriteit,status,kenteken,hubspot_deal_id,samenvatting',
      { count: 'exact' }
    )
    .order('ontvangen_op', { ascending: false })
    .range(offset, offset + limit - 1)

  // Status filter: 'alle' toont alles
  if (status !== 'alle') {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    berichten: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}