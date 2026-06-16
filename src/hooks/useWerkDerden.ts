'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { WerkDerdenRecord, WerkDerdenStatus, WerkRegel } from '@/types';

const CACHE_KEY = 'pepe_wd_v1';

function deserialize(r: Record<string, unknown>): WerkDerdenRecord {
  return {
    ...(r as unknown as WerkDerdenRecord),
    status: (r.status as WerkDerdenStatus) ?? 'open',
    regels: Array.isArray(r.regels) ? r.regels : [],
    bestemming: ((r.bestemming as string) ?? 'doorbelasten') as import('@/types').WerkDerdenBestemming,
  };
}

/** Fire-and-forget notificatie-mail bij status-overgang; faalt stil. */
function notify(id: string, event: 'ingediend' | 'goedgekeurd' | 'afgekeurd') {
  void fetch('/api/werk-derden/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, event }),
  }).catch(() => {});
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
    // quota exceeded â€” ignore
  }
}

/**
 * useWerkDerden(wie?, rol?)
 * - wie  = partner-naam: filtert op eigen meldingen
 * - rol  = 'pepe': geeft alle meldingen (PEPE-overzicht)
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

  // Actieve records die aandacht vereisen
  const actieCount = records.filter(
    (r) => r.status === 'open' || r.status === 'goedgekeurd' || r.status === 'klaar_gemeld',
  ).length;

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
      notify(inserted.id, 'ingediend');
      return { ok: true };
    },
    [],
  );

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

  const setGoedgekeurd = useCallback(
    async (
      id: string,
      opties?: { regels?: WerkRegel[]; voorwaarden?: string; klant?: string; door?: string },
    ) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'goedgekeurd',
        goedgekeurd_op: new Date().toISOString(),
      };
      if (opties?.door) patch.goedgekeurd_door = opties.door;
      if (opties?.regels) {
        patch.regels = opties.regels;
        patch.inkoop_bedrag = opties.regels.reduce((s, r) => s + r.bedrag, 0);
      }
      if (opties?.voorwaarden != null) patch.voorwaarden = opties.voorwaarden;
      if (opties?.klant) patch.klant = opties.klant;
      const result = await updateRecord(id, patch);
      if (result.ok) notify(id, 'goedgekeurd');
      return result;
    },
    [updateRecord],
  );

  const setAfgekeurd = useCallback(
    async (id: string, reden: string, door?: string) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'afgekeurd',
        afkeur_reden: reden,
        afgekeurd_op: new Date().toISOString(),
      };
      if (door) patch.afgekeurd_door = door;
      const result = await updateRecord(id, patch);
      if (result.ok) notify(id, 'afgekeurd');
      return result;
    },
    [updateRecord],
  );

  const setAfgerond = useCallback(
    async (id: string, door?: string) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'afgerond',
        afgerond_op: new Date().toISOString(),
      };
      if (door) patch.afgerond_door = door;
      return updateRecord(id, patch);
    },
    [updateRecord],
  );

  const setKlaarGemeld = useCallback(
    async (id: string) => updateRecord(id, { status: 'klaar_gemeld' }),
    [updateRecord],
  );

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

  const bijlageUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('werk-derden')
      .createSignedUrl(storagePath, 60 * 60);
    if (error) {
      console.error('werk_derden bijlage url fout:', error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return {
    records,
    loading,
    actieCount,
    addRecord,
    updateRecord,
    setGoedgekeurd,
    setAfgerond,
    setAfgekeurd,
    setKlaarGemeld,
    setGefactureerd,
    bijlageUrl,
  };
}


