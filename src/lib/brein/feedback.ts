import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type BreinFeedbackScope = 'brein' | 'leads';

/**
 * Haalt de meest recente actieve leerpunten op voor een conceptprompt.
 * Feedback faalt bewust zacht: conceptgeneratie moet blijven werken als de tabel
 * nog niet gemigreerd of tijdelijk niet bereikbaar is.
 */
export async function laadBreinFeedback(scope: BreinFeedbackScope): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin
    .from('brein_feedback')
    .select('feedback')
    .eq('scope', scope)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn(`[brein/feedback] Feedback ophalen voor ${scope} mislukt:`, error.message);
    return undefined;
  }

  const regels = (data ?? [])
    .map((item) => String(item.feedback ?? '').trim())
    .filter(Boolean)
    .map((tekst, index) => `${index + 1}. ${tekst}`);

  return regels.length > 0 ? regels.join('\n').slice(0, 12000) : undefined;
}
