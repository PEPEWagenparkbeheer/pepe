'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BtwRecord } from '@/types';

const SK = 'pepe_btw_v1';

const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';

function deserialize(r: Record<string, unknown>): BtwRecord {
  return {
    ...(r as unknown as BtwRecord),
    gelangenbest_verstuurd: bool(r.gelangenbest_verstuurd),
    geld_van_lm: bool(r.geld_van_lm),
    geld_van_dealer: bool(r.geld_van_dealer),
    gearchiveerd: bool(r.gearchiveerd),
  };
}

function localLoad(): BtwRecord[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSave(data: BtwRecord[]) {
  try { localStorage.setItem(SK, JSON.stringify(data)); } catch { /* leeg */ }
}

export function useBtw() {
  const [records, setRecords] = useState<BtwRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<BtwRecord[]>([]);

  function update(next: BtwRecord[]) {
    ref.current = next;
    setRecords(next);
    localSave(next);
  }

  useEffect(() => {
    const lokaal = localLoad();
    if (lokaal.length) { ref.current = lokaal; setRecords(lokaal); }

    supabase.from('btw_records').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!error && data) update((data as Record<string, unknown>[]).map(deserialize));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async (rec: Omit<BtwRecord, 'id' | 'created_at'>) => {
    const nieuw: BtwRecord = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    update([nieuw, ...ref.current]);
    try { await supabase.from('btw_records').insert(nieuw); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const save = useCallback(async (rec: BtwRecord) => {
    update(ref.current.map((r) => (r.id === rec.id ? rec : r)));
    try { await supabase.from('btw_records').upsert(rec); } catch { /* leeg */ }
  }, []);

  const remove = useCallback(async (id: string) => {
    update(ref.current.filter((r) => r.id !== id));
    try { await supabase.from('btw_records').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  const toggle = useCallback(async (id: string, veld: keyof BtwRecord) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;
    await save({ ...rec, [veld]: !rec[veld] });
  }, [save]);

  return { records, loading, add, save, remove, toggle };
}
