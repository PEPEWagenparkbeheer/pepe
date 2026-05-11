'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AfterSalesAuto, ASKlacht } from '@/types';

const AS_SK = 'pepe_as_v1';
const NAL_SK = 'pepe_nal_v1';

// ── Bool helper ───────────────────────────────────────────────
const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';

// Lege strings in datumvelden veroorzaken een Supabase 400-fout (PostgreSQL verwerpt '' als date).
// Dit converteert ze naar null voordat het record naar de DB gaat.
const DATE_VELDEN = ['afleverdatum', 'transportdatum', 'proefrit_op', 'binnen_op', 'afgeleverd_op'] as const;
function prepareForDb(rec: AfterSalesAuto): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rec };
  for (const v of DATE_VELDEN) {
    if (out[v] === '') out[v] = null;
  }
  return out;
}

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
    wie_rijklaar_klaar: bool(r.wie_rijklaar_klaar),
    klaar: bool(r.klaar),
    factuur: bool(r.factuur),
    poetsen: bool(r.poetsen),
    hubspot: bool(r.hubspot),
    gearchiveerd: bool(r.gearchiveerd),
    veld_meta: (r.veld_meta as Record<string, { op: string; door: string }>) ?? {},
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
  const [gebruiker, setGebruiker] = useState('');
  const autosRef = useRef<AfterSalesAuto[]>([]);
  const klachtenRef = useRef<ASKlacht[]>([]);
  const gebruikerRef = useRef('');

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
    // Gebruiker ophalen
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const naam = u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? '?';
      gebruikerRef.current = naam;
      setGebruiker(naam);
    });

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

    const ch1 = supabase.channel(`as_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'after_sales' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = deserializeAuto(payload.new as Record<string, unknown>);
          updateAutos(autosRef.current.some(r => r.id === rec.id)
            ? autosRef.current.map(r => r.id === rec.id ? rec : r)
            : [rec, ...autosRef.current]);
        } else if (payload.eventType === 'DELETE') {
          updateAutos(autosRef.current.filter(r => r.id !== (payload.old as { id: string }).id));
        }
      }).subscribe();

    const ch2 = supabase.channel(`nal_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'as_klachten' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = payload.new as ASKlacht;
          updateKlachten(klachtenRef.current.some(r => r.id === rec.id)
            ? klachtenRef.current.map(r => r.id === rec.id ? rec : r)
            : [rec, ...klachtenRef.current]);
        } else if (payload.eventType === 'DELETE') {
          updateKlachten(klachtenRef.current.filter(r => r.id !== (payload.old as { id: string }).id));
        }
      }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  // ── Autos ─────────────────────────────────────────────────
  const addAuto = useCallback(async (rec: Omit<AfterSalesAuto, 'id' | 'created_at'>) => {
    const nieuw: AfterSalesAuto = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateAutos([nieuw, ...autosRef.current]);
    const { error } = await supabase.from('after_sales').insert(prepareForDb(nieuw));
    if (error) console.error('after_sales insert fout:', error.message, error.details);
    return nieuw;
  }, []);

  const updateAuto = useCallback(async (rec: AfterSalesAuto) => {
    updateAutos(autosRef.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('after_sales').upsert(prepareForDb(rec));
    if (error) console.error('after_sales upsert fout:', error.message, error.details);
  }, []);

  const removeAuto = useCallback(async (id: string) => {
    updateAutos(autosRef.current.filter((r) => r.id !== id));
    try { await supabase.from('after_sales').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  // toggleAuto voegt automatisch tijdstempel + gebruiker toe aan veld_meta
  const toggleAuto = useCallback(async (id: string, veld: keyof AfterSalesAuto) => {
    const rec = autosRef.current.find((r) => r.id === id);
    if (!rec) return;
    const nieuweWaarde = !rec[veld];
    const meta = { ...(rec.veld_meta ?? {}) };
    const extra: Partial<AfterSalesAuto> = {};
    if (nieuweWaarde) {
      meta[String(veld)] = { op: new Date().toISOString(), door: gebruikerRef.current || '?' };
      if (veld === 'binnen') extra.binnen_op = new Date().toISOString().slice(0, 10);
    } else {
      delete meta[String(veld)];
      if (veld === 'binnen') extra.binnen_op = undefined;
    }
    await updateAuto({ ...rec, [veld]: nieuweWaarde, veld_meta: meta, ...extra });
  }, [updateAuto]);

  // Hulpfunctie voor rijklaar-tab: update met metadata in één aanroep
  const toggleAutoMeta = useCallback(async (rec: AfterSalesAuto, veld: keyof AfterSalesAuto, nieuweWaarde: boolean, extra?: Partial<AfterSalesAuto>) => {
    const meta = { ...(rec.veld_meta ?? {}) };
    if (nieuweWaarde) {
      meta[String(veld)] = { op: new Date().toISOString(), door: gebruikerRef.current || '?' };
    } else {
      delete meta[String(veld)];
    }
    await updateAuto({ ...rec, [veld]: nieuweWaarde, veld_meta: meta, ...(extra ?? {}) });
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
    autos, klachten, loading, gebruiker,
    addAuto, updateAuto, removeAuto, toggleAuto, toggleAutoMeta,
    addKlacht, updateKlacht, removeKlacht,
  };
}
