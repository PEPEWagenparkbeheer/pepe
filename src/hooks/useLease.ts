'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeaseAanvraag, LeaseKlant } from '@/types';

const AANVRAAG_SK = 'pepe_lease_v1';
const KLANT_SK = 'pepe_lease_klanten_v1';

const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';

function deserializeAanvraag(r: Record<string, unknown>): LeaseAanvraag {
  return {
    ...(r as unknown as LeaseAanvraag),
    offerte_verstuurd: bool(r.offerte_verstuurd),
    vervangend_vervoer: bool(r.vervangend_vervoer),
    brandstofvoorschot: bool(r.brandstofvoorschot),
    akkoord: bool(r.akkoord),
    verkocht: bool(r.verkocht),
    in_btw_lijst: bool(r.in_btw_lijst),
  };
}

function deserializeKlant(r: Record<string, unknown>): LeaseKlant {
  return {
    ...(r as unknown as LeaseKlant),
    vervangend_vervoer: bool(r.vervangend_vervoer),
    brandstofvoorschot: bool(r.brandstofvoorschot),
  };
}

function localLoad<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSave<T>(key: string, data: T[]) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* leeg */ }
}

export function useLease() {
  const [aanvragen, setAanvragen] = useState<LeaseAanvraag[]>([]);
  const [klanten, setKlanten] = useState<LeaseKlant[]>([]);
  const [loading, setLoading] = useState(true);
  const aanvraagRef = useRef<LeaseAanvraag[]>([]);
  const klantRef = useRef<LeaseKlant[]>([]);

  function updateAanvragen(next: LeaseAanvraag[]) {
    aanvraagRef.current = next;
    setAanvragen(next);
    localSave(AANVRAAG_SK, next);
  }
  function updateKlanten(next: LeaseKlant[]) {
    klantRef.current = next;
    setKlanten(next);
    localSave(KLANT_SK, next);
  }

  useEffect(() => {
    const lokaalA = localLoad<LeaseAanvraag>(AANVRAAG_SK);
    const lokaalK = localLoad<LeaseKlant>(KLANT_SK);
    if (lokaalA.length) { aanvraagRef.current = lokaalA; setAanvragen(lokaalA); }
    if (lokaalK.length) { klantRef.current = lokaalK; setKlanten(lokaalK); }

    Promise.all([
      supabase.from('lease_aanvragen').select('*').order('created_at', { ascending: false }),
      supabase.from('lease_klanten').select('*').order('naam', { ascending: true }),
    ]).then(([aRes, kRes]) => {
      if (!aRes.error && aRes.data) updateAanvragen((aRes.data as Record<string, unknown>[]).map(deserializeAanvraag));
      if (!kRes.error && kRes.data) updateKlanten((kRes.data as Record<string, unknown>[]).map(deserializeKlant));
      setLoading(false);
    });
  }, []);

  // ── Aanvragen ─────────────────────────────────────────────
  const addAanvraag = useCallback(async (rec: Omit<LeaseAanvraag, 'id' | 'created_at'>) => {
    const nieuw: LeaseAanvraag = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateAanvragen([nieuw, ...aanvraagRef.current]);
    try { await supabase.from('lease_aanvragen').insert(nieuw); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const saveAanvraag = useCallback(async (rec: LeaseAanvraag) => {
    updateAanvragen(aanvraagRef.current.map((r) => (r.id === rec.id ? rec : r)));
    try { await supabase.from('lease_aanvragen').upsert(rec); } catch { /* leeg */ }
  }, []);

  const removeAanvraag = useCallback(async (id: string) => {
    updateAanvragen(aanvraagRef.current.filter((r) => r.id !== id));
    try { await supabase.from('lease_aanvragen').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  // ── Klanten ───────────────────────────────────────────────
  const addKlant = useCallback(async (rec: Omit<LeaseKlant, 'id' | 'created_at'>) => {
    const nieuw: LeaseKlant = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateKlanten([...klantRef.current, nieuw].sort((a, b) => a.naam.localeCompare(b.naam)));
    try { await supabase.from('lease_klanten').insert(nieuw); } catch { /* leeg */ }
    return nieuw;
  }, []);

  const saveKlant = useCallback(async (rec: LeaseKlant) => {
    updateKlanten(klantRef.current.map((r) => (r.id === rec.id ? rec : r)));
    try { await supabase.from('lease_klanten').upsert(rec); } catch { /* leeg */ }
  }, []);

  const removeKlant = useCallback(async (id: string) => {
    updateKlanten(klantRef.current.filter((r) => r.id !== id));
    try { await supabase.from('lease_klanten').delete().eq('id', id); } catch { /* leeg */ }
  }, []);

  return {
    aanvragen, klanten, loading,
    addAanvraag, saveAanvraag, removeAanvraag,
    addKlant, saveKlant, removeKlant,
  };
}
