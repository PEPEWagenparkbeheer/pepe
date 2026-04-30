'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SK } from '@/lib/constants';
import type { Zoekopdracht } from '@/types';

// ── Supabase serialisatie ────────────────────────────────────
function serialize(r: Zoekopdracht): Record<string, unknown> {
  return {
    ...r,
    kleuren: JSON.stringify(r.kleuren ?? []),
    opties: JSON.stringify(r.opties ?? {}),
    brandstof: JSON.stringify(r.brandstof ?? []),
  };
}

function deserialize(r: Record<string, unknown>): Zoekopdracht {
  let kleuren: string[] = [];
  let opties: Record<string, boolean> = {};
  let brandstof: string[] = [];

  try { kleuren = typeof r.kleuren === 'string' ? JSON.parse(r.kleuren) : (r.kleuren as string[] ?? []); } catch { /* leeg */ }
  try { opties = typeof r.opties === 'string' ? JSON.parse(r.opties) : (r.opties as Record<string, boolean> ?? {}); } catch { /* leeg */ }
  try { brandstof = typeof r.brandstof === 'string' ? JSON.parse(r.brandstof) : (r.brandstof as string[] ?? []); } catch { /* leeg */ }

  const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';

  return {
    ...(r as unknown as Zoekopdracht),
    kleuren,
    opties,
    brandstof,
    uitgewerkt: bool(r.uitgewerkt),
    terugkoppeling: bool(r.terugkoppeling),
    dealer: bool(r.dealer),
    inkopen: bool(r.inkopen),
    contract: bool(r.contract),
    akkoord: bool(r.akkoord),
    prio: bool(r.prio),
    uitgesteld: bool(r.uitgesteld),
  };
}

// ── localStorage helpers ─────────────────────────────────────
function localLoad(): Zoekopdracht[] {
  if (typeof window === 'undefined') return [];
  try {
    const s = localStorage.getItem(SK);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function localSave(records: Zoekopdracht[]) {
  try { localStorage.setItem(SK, JSON.stringify(records)); } catch { /* leeg */ }
}

// ── Hook ─────────────────────────────────────────────────────
export function useZoekopdrachten() {
  const [records, setRecords] = useState<Zoekopdracht[]>([]);
  const [loading, setLoading] = useState(true);
  const recordsRef = useRef<Zoekopdracht[]>([]);

  function updateRecords(next: Zoekopdracht[]) {
    recordsRef.current = next;
    setRecords(next);
    localSave(next);
  }

  useEffect(() => {
    const lokaal = localLoad();
    if (lokaal.length) {
      recordsRef.current = lokaal;
      setRecords(lokaal);
    }

    supabase
      .from('zoekopdrachten')
      .select('*')
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          const verwerkt = (data as Record<string, unknown>[]).map(deserialize);
          updateRecords(verwerkt);
        }
        setLoading(false);
      });
  }, []);

  const add = useCallback(async (rec: Omit<Zoekopdracht, 'id'>) => {
    const nieuw: Zoekopdracht = { ...rec, id: Date.now() };
    const next = [...recordsRef.current, nieuw];
    updateRecords(next);
    try { await supabase.from('zoekopdrachten').upsert(serialize(nieuw)); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const update = useCallback(async (rec: Zoekopdracht) => {
    const next = recordsRef.current.map((r) => (r.id === rec.id ? rec : r));
    updateRecords(next);
    try { await supabase.from('zoekopdrachten').upsert(serialize(rec)); } catch { /* leeg */ }
  }, []);

  const remove = useCallback(async (id: number) => {
    const next = recordsRef.current.filter((r) => r.id !== id);
    updateRecords(next);
    try { await supabase.from('zoekopdrachten').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  const togglePrio = useCallback(async (id: number) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    if (!rec) return;
    await update({ ...rec, prio: !rec.prio });
  }, [update]);

  const quickToggle = useCallback(async (id: number, veld: keyof Zoekopdracht) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    if (!rec) return;
    await update({ ...rec, [veld]: !rec[veld] });
  }, [update]);

  return { records, loading, add, update, remove, togglePrio, quickToggle };
}
