'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AfterSalesAuto, ASKlacht } from '@/types';

const AS_SK = 'pepe_as_v1';
const NAL_SK = 'pepe_nal_v1';

// ── Bool helper ───────────────────────────────────────────────
const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';

// ── AfterSalesAuto serialisatie ───────────────────────────────
function deserializeAuto(r: Record<string, unknown>): AfterSalesAuto {
  return {
    ...(r as unknown as AfterSalesAuto),
    binnen: bool(r.binnen),
    aflevercontrole: bool(r.aflevercontrole),
    aangevraagd: bool(r.aangevraagd),
    betaald: bool(r.betaald),
    rdw_ingeschreven: bool(r.rdw_ingeschreven),
    bpm_ingediend: bool(r.bpm_ingediend),
    bpm_goedgekeurd: bool(r.bpm_goedgekeurd),
    bin_ontvangen: bool(r.bin_ontvangen),
    kentekenbewijzen: bool(r.kentekenbewijzen),
    gelangenbest: bool(r.gelangenbest),
    proefrit: bool(r.proefrit),
    klaar: bool(r.klaar),
    factuur: bool(r.factuur),
    poetsen: bool(r.poetsen),
    hubspot: bool(r.hubspot),
    gearchiveerd: bool(r.gearchiveerd),
  };
}

// ── localStorage helpers ──────────────────────────────────────
function localLoadAutos(): AfterSalesAuto[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(AS_SK); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSaveAutos(data: AfterSalesAuto[]) {
  try { localStorage.setItem(AS_SK, JSON.stringify(data)); } catch { /* leeg */ }
}
function localLoadKlachten(): ASKlacht[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(NAL_SK); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSaveKlachten(data: ASKlacht[]) {
  try { localStorage.setItem(NAL_SK, JSON.stringify(data)); } catch { /* leeg */ }
}

// ── Hook ─────────────────────────────────────────────────────
export function useAfterSales() {
  const [autos, setAutos] = useState<AfterSalesAuto[]>([]);
  const [klachten, setKlachten] = useState<ASKlacht[]>([]);
  const [loading, setLoading] = useState(true);
  const autosRef = useRef<AfterSalesAuto[]>([]);
  const klachtenRef = useRef<ASKlacht[]>([]);

  function updateAutos(next: AfterSalesAuto[]) {
    autosRef.current = next;
    setAutos(next);
    localSaveAutos(next);
  }
  function updateKlachten(next: ASKlacht[]) {
    klachtenRef.current = next;
    setKlachten(next);
    localSaveKlachten(next);
  }

  useEffect(() => {
    const lokaalAutos = localLoadAutos();
    const lokaalKlachten = localLoadKlachten();
    if (lokaalAutos.length) { autosRef.current = lokaalAutos; setAutos(lokaalAutos); }
    if (lokaalKlachten.length) { klachtenRef.current = lokaalKlachten; setKlachten(lokaalKlachten); }

    Promise.all([
      supabase.from('after_sales').select('*').order('created_at', { ascending: false }),
      supabase.from('as_klachten').select('*').order('created_at', { ascending: false }),
    ]).then(([autosRes, klachtenRes]) => {
      if (!autosRes.error && autosRes.data) {
        updateAutos((autosRes.data as Record<string, unknown>[]).map(deserializeAuto));
      }
      if (!klachtenRes.error && klachtenRes.data) {
        updateKlachten(klachtenRes.data as ASKlacht[]);
      }
      setLoading(false);
    });
  }, []);

  // ── Autos ─────────────────────────────────────────────────
  const addAuto = useCallback(async (rec: Omit<AfterSalesAuto, 'id' | 'created_at'>) => {
    const nieuw: AfterSalesAuto = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateAutos([nieuw, ...autosRef.current]);
    try { await supabase.from('after_sales').insert(nieuw); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const updateAuto = useCallback(async (rec: AfterSalesAuto) => {
    updateAutos(autosRef.current.map((r) => (r.id === rec.id ? rec : r)));
    try { await supabase.from('after_sales').upsert(rec); } catch { /* leeg */ }
  }, []);

  const removeAuto = useCallback(async (id: string) => {
    updateAutos(autosRef.current.filter((r) => r.id !== id));
    try { await supabase.from('after_sales').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  const toggleAuto = useCallback(async (id: string, veld: keyof AfterSalesAuto) => {
    const rec = autosRef.current.find((r) => r.id === id);
    if (!rec) return;
    await updateAuto({ ...rec, [veld]: !rec[veld] });
  }, [updateAuto]);

  // ── Klachten ──────────────────────────────────────────────
  const addKlacht = useCallback(async (rec: Omit<ASKlacht, 'id' | 'created_at'>) => {
    const nieuw: ASKlacht = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateKlachten([nieuw, ...klachtenRef.current]);
    try { await supabase.from('as_klachten').insert(nieuw); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const updateKlacht = useCallback(async (rec: ASKlacht) => {
    updateKlachten(klachtenRef.current.map((r) => (r.id === rec.id ? rec : r)));
    try { await supabase.from('as_klachten').upsert(rec); } catch { /* leeg */ }
  }, []);

  const removeKlacht = useCallback(async (id: string) => {
    updateKlachten(klachtenRef.current.filter((r) => r.id !== id));
    try { await supabase.from('as_klachten').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  return {
    autos, klachten, loading,
    addAuto, updateAuto, removeAuto, toggleAuto,
    addKlacht, updateKlacht, removeKlacht,
  };
}
