'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Factuur, FactuurStatus } from '@/types';

function deserialize(r: Record<string, unknown>): Factuur {
  return {
    ...(r as unknown as Factuur),
    gearchiveerd: r.gearchiveerd === true || r.gearchiveerd === 'true',
    status: (r.status as FactuurStatus) ?? 'nieuw',
  };
}

export function useFacturen() {
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [loading, setLoading] = useState(true);
  const [gebruiker, setGebruiker] = useState('');
  const ref = useRef<Factuur[]>([]);
  const gebruikerRef = useRef('');

  function update(next: Factuur[]) {
    ref.current = next;
    setFacturen(next);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const rawNaam = u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? '?';
      const naam = rawNaam.charAt(0).toUpperCase() + rawNaam.slice(1);
      gebruikerRef.current = naam;
      setGebruiker(naam);
    });

    supabase.from('facturen').select('*').order('ontvangen_op', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) update((data as Record<string, unknown>[]).map(deserialize));
        setLoading(false);
      });

    const ch = supabase.channel(`facturen_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturen' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = deserialize(payload.new as Record<string, unknown>);
          update(ref.current.some(r => r.id === rec.id)
            ? ref.current.map(r => r.id === rec.id ? rec : r)
            : [rec, ...ref.current]);
        } else if (payload.eventType === 'DELETE') {
          update(ref.current.filter(r => r.id !== (payload.old as { id: string }).id));
        }
      }).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = useCallback(async (rec: Factuur) => {
    update(ref.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('facturen').upsert({
      ...rec,
      status: rec.status === 'nieuw' ? 'bewerkt' : rec.status,
    });
    if (error) console.error('facturen upsert fout:', error.message);
  }, []);

  const akkoord = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`/api/facturen/${id}/approve`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Onbekende fout' };
    update(ref.current.map((r) =>
      r.id === id ? { ...r, status: 'goedgekeurd', gearchiveerd: true, hubspot_synced_at: new Date().toISOString() } : r,
    ));
    return { ok: true };
  }, []);

  const negeer = useCallback(async (id: string) => {
    update(ref.current.map((r) =>
      r.id === id ? { ...r, status: 'genegeerd', gearchiveerd: true } : r,
    ));
    await fetch(`/api/facturen/${id}/ignore`, { method: 'POST' });
  }, []);

  const terugzetten = useCallback(async (rec: Factuur) => {
    await save({ ...rec, gearchiveerd: false, status: 'nieuw' });
  }, [save]);

  const pdfUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('facturen')
      .createSignedUrl(storagePath, 60 * 60); // 1u
    if (error) {
      console.error('pdf signed url fout:', error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return { facturen, loading, gebruiker, save, akkoord, negeer, terugzetten, pdfUrl };
}
