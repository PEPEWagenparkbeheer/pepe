'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Matches brein_messages.status column values in the DB migration
export type BreinStatus = 'nieuw' | 'opgepakt' | 'in_behandeling' | 'afgehandeld' | 'overgeslagen';
export type BreinPrioriteit = 'laag' | 'normaal' | 'hoog' | 'urgent';

export interface BreinMessage {
  id: string;
  graph_message_id: string;
  mailbox: string;
  onderwerp: string | null;
  afzender_email: string | null;
  afzender_naam: string | null;
  ontvangen_op: string | null;
  body_preview: string | null;
  body_html: string | null;
  categorie: string | null;
  prioriteit: BreinPrioriteit;
  samenvatting: string | null;
  hubspot_deal_id: string | null;
  hubspot_company_id: string | null;
  kenteken: string | null;
  status: BreinStatus;
  concept_antwoord: string | null;
  verzonden_op: string | null;
}

const COLS =
  'id,graph_message_id,mailbox,onderwerp,afzender_email,afzender_naam,ontvangen_op,' +
  'body_preview,body_html,categorie,prioriteit,samenvatting,hubspot_deal_id,' +
  'hubspot_company_id,kenteken,status,concept_antwoord,verzonden_op';

/**
 * Leest BREIN-mailberichten uit Supabase.
 * Gebruikt de anon-client met ingelogde sessie (RLS: rol `authenticated`),
 * net als de andere Flow-modules (zie useLeads).
 */
export function useBreinMessages() {
  const [messages, setMessages] = useState<BreinMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<BreinMessage[]>([]);

  function update(next: BreinMessage[]) {
    ref.current = next;
    setMessages(next);
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('brein_messages')
      .select(COLS)
      .order('ontvangen_op', { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      update((data ?? []) as unknown as BreinMessage[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Zet de status van een bericht (optimistisch + persistent). */
  const setStatus = useCallback(async (id: string, status: BreinStatus) => {
    update(ref.current.map((m) => (m.id === id ? { ...m, status } : m)));
    const { error } = await supabase
      .from('brein_messages')
      .update({ status })
      .eq('id', id);
    if (error) console.error('brein status update fout:', error.message);
  }, []);

  return { messages, loading, error, refresh, setStatus };
}