'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { WerkDerdenRecord, WerkDerdenStatus } from '@/types';

const CACHE_KEY = 'pepe_wd_v1';

function deserialize(r: Record<string, unknown>): WerkDerdenRecord {
  return {
    ...(r as unknown as WerkDerdenRecord),
    status: (r.status as WerkDerdenStatus) ?? 'open',
    regels: Array.isArray(r.regels) ? r.regels : [],
  };
}

function cacheLoad(): WerkDerdenRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WerkDerdenRecord[]) : [];
  } catch {
    return [];
  }
}

function cacheSave(records: WerkDerdenRecord[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records));
  } catch {
    // quota exceeded — ignore
  }
}

/**
 * useWerkDerden(wie?, rol?)
 * - wie  = partner-naam: filtert op eigen meldingen
 * - rol  = 'pepe': geeft alle meldingen (PEPE-overzicht)
 * - geen args: geeft alle meldingen
 */
export function useWerkDerden(wie?: string, rol?: 'pepe') {
  const [records, setRecords] = useState<WerkDerdenRecord[]>(cacheLoad);
  const [loading, setLoading] = useState(true);
  const ref = useRef<WerkDerdenRecord[]>([]);

  function update(next: WerkDerdenRecord[]) {
    ref.current = next;
    cacheSave(next);
    setRecords(next);
  }

  useEffect(() => {
    let query = supabase.from('werk_derden').select('*').order('created_at', { ascending: false });
    if (wie && rol !== 'pepe') {
      query = query.eq('partner', wie);
    }

    query.then(({ data, error }) => {
      if (!error && data) update((data as Record<string, unknown>[]).map(deserialize));
      setLoading(false);
    });

    const channelId = `wd_realtime_${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'werk_derden' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = deserialize(payload.new as Record<string, unknown>);
          // Als partner-filter actief: alleen eigen meldingen tonen
          if (wie && rol !== 'pepe' && rec.partner !== wie) return;
          update(
            ref.current.some((r) => r.id === rec.id)
              ? ref.current.map((r) => (r.id === rec.id ? rec : r))
              : [rec, ...ref.current],
          );
        } else if (payload.eventType === 'DELETE') {
          update(ref.current.filter((r) => r.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [wie, rol]);

  const openCount = records.filter((r) => r.status === 'open').length;

  // Voeg een nieuwe melding toe
  const addRecord = useCallback(
    async (rec: Omit<WerkDerdenRecord, 'id' | 'created_at'>): Promise<{ ok: boolean; error?: string }> => {
      const { data, error } = await supabase
        .from('werk_derden')
        .insert(rec)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      const inserted = deserialize(data as Record<string, unknown>);
      update([inserted, ...ref.current]);
      return { ok: true };
    },
    [],
  );

  // Update een bestaande melding (gedeeltelijk)
  const updateRecord = useCallback(
    async (id: string, patch: Partial<WerkDerdenRecord>): Promise<{ ok: boolean; error?: string }> => {
      const { error } = await supabase
        .from('werk_derden')
        .update(patch)
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      update(ref.current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { ok: true };
    },
    [],
  );

  // Keur een melding af
  const setAfgekeurd = useCallback(
    async (id: string, reden: string) =>
      updateRecord(id, { status: 'afgekeurd', afkeur_reden: reden }),
    [updateRecord],
  );

  // Markeer als gefactureerd (PEPE vult verkoop_bedrag in)
  const setGefactureerd = useCallback(
    async (id: string, verkoop_bedrag: number): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch('/api/werk-derden/factureren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, verkoop_bedrag }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) return { ok: false, error: json.error ?? 'Onbekende fout' };
      update(
        ref.current.map((r) =>
          r.id === id
            ? { ...r, status: 'gefactureerd', verkoop_bedrag, gefactureerd_op: new Date().toISOString() }
            : r,
        ),
      );
      return { ok: true };
    },
    [],
  );

  // Haal een signed URL op voor de bijlage
  const bijlageUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('werk-derden')
      .createSignedUrl(storagePath, 60 * 60); // 1 uur
    if (error) {
      console.error('werk_derden bijlage url fout:', error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return { records, loading, openCount, addRecord, updateRecord, setAfgekeurd, setGefactureerd, bijlageUrl };
}
