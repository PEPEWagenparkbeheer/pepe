import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { BreinFeedbackScope } from '@/lib/brein/feedback';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json() as {
      scope?: BreinFeedbackScope;
      feedback?: string;
      sourceId?: string | null;
      originalContext?: string | null;
      conceptResponse?: string | null;
    };
    const feedback = body.feedback?.trim() ?? '';
    if (body.scope !== 'brein' && body.scope !== 'leads') {
      return NextResponse.json({ error: 'Ongeldige feedbackscope' }, { status: 400 });
    }
    if (feedback.length < 3 || feedback.length > 1000) {
      return NextResponse.json({ error: 'Feedback moet tussen 3 en 1000 tekens zijn' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('brein_feedback')
      .insert({
        scope: body.scope,
        feedback,
        source_id: body.sourceId?.slice(0, 200) || null,
        original_context: body.originalContext?.slice(0, 8000) || null,
        concept_response: body.conceptResponse?.slice(0, 8000) || null,
        created_by: gate.user.email ?? gate.user.id,
      })
      .select('id, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, feedback: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[brein/feedback] Opslaan mislukt:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
