'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/clientAuth';

// Matches brein_messages.status column values in the DB migration
export type BreinStatus = 'nieuw' | 'opgepakt' | 'in_behandeling' | 'afgehandeld' | 'overgeslagen' | 'verzonden';
export type BreinPrioriteit = 'laag' | 'normaal' | 'hoog' | 'urgent';

/** Eén stap in de behandel-historie van een bericht (wie deed wat, wanneer). */
export interface HistorieStap {
  status: BreinStatus;
  op: string; // ISO-tijd
  door: string; // medewerkersnaam
}

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
  behandeld_door: string | null;
  historie: HistorieStap[];
  is_read: boolean;
}

const COLS =
  'id,graph_message_id,mailbox,onderwerp,afzender_email,afzender_naam,ontvangen_op,' +
  'body_preview,body_html,categorie,prioriteit,samenvatting,hubspot_deal_id,' +
  'hubspot_company_id,kenteken,status,concept_antwoord,verzonden_op,behandeld_door,historie,is_read';

/**
 * Leest BREIN-mailberichten uit Supabase.
 * Gebruikt de anon-client met ingelogde sessie (RLS: rol `authenticated`),
 * net als de andere Flow-modules (zie useLeads).
 */
export function useBreinMessages() {
  const [messages, setMessages] = useState<BreinMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gebruiker, setGebruiker] = useState('');
  const ref = useRef<BreinMessage[]>([]);
  const gebruikerRef = useRef('');

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
    // Ingelogde medewerker bepalen (voor de stamps), zelfde afleiding als useLeads.
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const rawNaam =
        (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.name as string | undefined) ??
        u.email?.split('@')[0] ??
        '?';
      const naam = rawNaam.charAt(0).toUpperCase() + rawNaam.slice(1);
      gebruikerRef.current = naam;
      setGebruiker(naam);
    });

    void refresh();
  }, [refresh]);

  /**
   * Zet de status van een bericht en stempelt wie + wanneer.
   * Optimistisch in de UI, daarna persistent in Supabase (incl. historie).
   */
  const setStatus = useCallback(async (id: string, status: BreinStatus) => {
    const huidige = ref.current.find((m) => m.id === id);
    if (!huidige) return;

    const door = gebruikerRef.current || '?';
    const stap: HistorieStap = { status, op: new Date().toISOString(), door };
    const historie = [...(huidige.historie ?? []), stap];

    update(
      ref.current.map((m) =>
        m.id === id ? { ...m, status, behandeld_door: door, historie } : m,
      ),
    );

    const { error } = await supabase
      .from('brein_messages')
      .update({ status, behandeld_door: door, historie })
      .eq('id', id);
    if (error) console.error('brein status update fout:', error.message);
  }, []);

  /** Haalt nieuwe mail uit Outlook (Graph → DB) en herlaadt daarna de lijst. */
  const sync = useCallback(async () => {
    const res = await fetch('/api/brein/sync', { method: 'POST', headers: await authHeaders() });
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const data = (await res.json()) as { synced: number; skipped: number };
    await refresh();
    return data;
  }, [refresh]);

  /** Stuur onverwerkte berichten naar de classifier (server-side). */
  const classify = useCallback(async () => {
    const res = await fetch('/api/brein/classify', { method: 'POST', headers: await authHeaders() });
    if (!res.ok) throw new Error(`classify ${res.status}`);
    const data = (await res.json()) as { classified: number; errors: number; total_onverwerkt: number };
    if (data.classified > 0) await refresh();
    return data;
  }, [refresh]);

  /** Laat Claude een concept-antwoord genereren (server-side) en zet het in state. */
  const genereerConcept = useCallback(async (id: string) => {
    const res = await fetch('/api/brein/concept', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error ?? `concept ${res.status}`);
    }
    const data = (await res.json()) as { concept: string };
    update(ref.current.map((m) => (m.id === id ? { ...m, concept_antwoord: data.concept } : m)));
    return data.concept;
  }, []);

  /** Door medewerker aangepast concept opslaan (client-side, RLS authenticated). */
  const saveConcept = useCallback(async (id: string, tekst: string) => {
    update(ref.current.map((m) => (m.id === id ? { ...m, concept_antwoord: tekst } : m)));
    const { error } = await supabase
      .from('brein_messages')
      .update({ concept_antwoord: tekst })
      .eq('id', id);
    if (error) console.error('concept opslaan fout:', error.message);
  }, []);

  /** Verstuurt het concept als reply namens fues@ (server-side) en markeert verzonden. */
  const verstuur = useCallback(async (id: string) => {
    const door = gebruikerRef.current || '?';
    const res = await fetch('/api/brein/send', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, door }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error ?? `send ${res.status}`);
    }
    const data = (await res.json()) as { verzonden_op?: string };
    const op = data.verzonden_op ?? new Date().toISOString();
    const stap: HistorieStap = { status: 'verzonden', op, door };
    update(
      ref.current.map((m) =>
        m.id === id
          ? {
              ...m,
              status: 'verzonden' as BreinStatus,
              verzonden_op: op,
              behandeld_door: door,
              historie: [...(m.historie ?? []), stap],
            }
          : m,
      ),
    );
    return data;
  }, []);

  return {
    messages,
    loading,
    error,
    gebruiker,
    refresh,
    sync,
    setStatus,
    classify,
    genereerConcept,
    saveConcept,
    verstuur,
  };
}

