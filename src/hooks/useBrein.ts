'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type BreinStatus = 'nieuw' | 'opgepakt' | 'in_behandeling' | 'afgehandeld' | 'overgeslagen';

export interface BreinBericht {
  id: string;
  graph_message_id: string;
  mailbox: string;
  onderwerp: string;
  afzender_email: string;
  afzender_naam: string;
  ontvangen_op: string;
  body_preview: string | null;
  body_html: string | null;
  categorie: string | null;
  prioriteit: 'laag' | 'normaal' | 'hoog' | 'urgent';
  samenvatting: string | null;
  hubspot_deal_id: string | null;
  hubspot_company_id: string | null;
  kenteken: string | null;
  status: BreinStatus;
  concept_antwoord: string | null;
  verzonden_op: string | null;
  verwerkt_op: string | null;
  created_at: string;
  updated_at: string;
}

export function useBrein() {
  const [berichten, setBerichten] = useState<BreinBericht[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const ref = useRef<BreinBericht[]>([]);

  function update(next: BreinBericht[]) {
    ref.current = next;
    setBerichten([...next]);
  }

  useEffect(() => {
    supabase
      .from('brein_messages')
      .select('*')
      .order('ontvangen_op', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!error && data) update(data as BreinBericht[]);
        setLoading(false);
      });

    const ch = supabase
      .channel(`brein_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brein_messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          update([payload.new as BreinBericht, ...ref.current]);
        } else if (payload.eventType === 'UPDATE') {
          const rec = payload.new as BreinBericht;
          update(ref.current.map((r) => (r.id === rec.id ? rec : r)));
        } else if (payload.eventType === 'DELETE') {
          update(ref.current.filter((r) => r.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const setStatus = useCallback(async (id: string, status: BreinStatus) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;
    const updated = { ...rec, status };
    update(ref.current.map((r) => (r.id === id ? updated : r)));
    await supabase.from('brein_messages').update({ status }).eq('id', id);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/brein/sync?secret=' + (process.env.NEXT_PUBLIC_BREIN_SYNC_SECRET ?? 'brein-sync-dev-2026'), {
        method: 'POST',
      });
      const data = await res.json();
      if (data.synced > 0) {
        // Realtime zal de nieuwe berichten pushen; forceer ook een refresh
        const { data: fresh } = await supabase
          .from('brein_messages')
          .select('*')
          .order('ontvangen_op', { ascending: false })
          .limit(200);
        if (fresh) update(fresh as BreinBericht[]);
      }
      return data as { synced: number; skipped: number };
    } finally {
      setSyncing(false);
    }
  }, []);

  return { berichten, loading, syncing, setStatus, sync };
}