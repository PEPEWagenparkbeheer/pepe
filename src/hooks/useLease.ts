'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeaseAanvraag, LeaseKlant } from '@/types';

const AANVRAAG_SK = 'pepe_lease_v1';
const KLANT_SK = 'pepe_lease_klanten_v1';

const bool = (v: unknown) => v === true || v === 'TRUE' || v === 'true';
const num = (v: unknown) => v != null && v !== '' ? Number(v) : undefined;

function deserializeAanvraag(r: Record<string, unknown>): LeaseAanvraag {
  return {
    ...(r as unknown as LeaseAanvraag),
    offerte_verstuurd:    bool(r.offerte_verstuurd),
    vervangend_vervoer:   bool(r.vervangend_vervoer),
    brandstofvoorschot:   bool(r.brandstofvoorschot),
    akkoord:              bool(r.akkoord),
    verkocht:             bool(r.verkocht),
    in_btw_lijst:         bool(r.in_btw_lijst),
    verdiensten_lm:       num(r.verdiensten_lm),
    verdiensten_dealer:   num(r.verdiensten_dealer),
    verdiensten_lm_pct:   num(r.verdiensten_lm_pct),
    verdiensten_dealer_pct: num(r.verdiensten_dealer_pct),
    leasenormbedrag:      num(r.leasenormbedrag),
    leasetarief:          num(r.leasetarief),
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
      supabase.from('lease_aanvragen').select('*').order('id', { ascending: false }),
      supabase.from('lease_klanten').select('*').order('naam', { ascending: true }),
    ]).then(([aRes, kRes]) => {
      if (!aRes.error && aRes.data) updateAanvragen((aRes.data as Record<string, unknown>[]).map(deserializeAanvraag));
      if (!kRes.error && kRes.data) updateKlanten((kRes.data as Record<string, unknown>[]).map(deserializeKlant));
      setLoading(false);
    });

    const ch1 = supabase.channel(`lease_a_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lease_aanvragen' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = deserializeAanvraag(payload.new as Record<string, unknown>);
          updateAanvragen(aanvraagRef.current.some(r => r.id === rec.id)
            ? aanvraagRef.current.map(r => r.id === rec.id ? rec : r)
            : [rec, ...aanvraagRef.current]);
        } else if (payload.eventType === 'DELETE') {
          updateAanvragen(aanvraagRef.current.filter(r => r.id !== (payload.old as { id: string }).id));
        }
      }).subscribe();

    const ch2 = supabase.channel(`lease_k_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lease_klanten' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = deserializeKlant(payload.new as Record<string, unknown>);
          updateKlanten(klantRef.current.some(r => r.id === rec.id)
            ? klantRef.current.map(r => r.id === rec.id ? rec : r)
            : [rec, ...klantRef.current]);
        } else if (payload.eventType === 'DELETE') {
          updateKlanten(klantRef.current.filter(r => r.id !== (payload.old as { id: string }).id));
        }
      }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  // ── Aanvragen ─────────────────────────────────────────────
  const addAanvraag = useCallback(async (rec: Omit<LeaseAanvraag, 'id' | 'created_at'>) => {
    const nieuw: LeaseAanvraag = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateAanvragen([nieuw, ...aanvraagRef.current]);
    const { error } = await supabase.from('lease_aanvragen').insert(nieuw);
    if (error) console.error('lease_aanvragen insert fout:', error.message, error.details);
    return nieuw;
  }, []);

  const saveAanvraag = useCallback(async (rec: LeaseAanvraag) => {
    updateAanvragen(aanvraagRef.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('lease_aanvragen').upsert(rec);
    if (error) console.error('lease_aanvragen upsert fout:', error.message, error.details);
  }, []);

  const removeAanvraag = useCallback(async (id: string) => {
    updateAanvragen(aanvraagRef.current.filter((r) => r.id !== id));
    const { error } = await supabase.from('lease_aanvragen').delete().eq('id', id);
    if (error) console.error('lease_aanvragen delete fout:', error.message);
  }, []);

  // ── Klanten ───────────────────────────────────────────────
  const addKlant = useCallback(async (rec: Omit<LeaseKlant, 'id' | 'created_at'>) => {
    const nieuw: LeaseKlant = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    updateKlanten([...klantRef.current, nieuw].sort((a, b) => a.naam.localeCompare(b.naam)));
    const { error } = await supabase.from('lease_klanten').insert(nieuw);
    if (error) console.error('lease_klanten insert fout:', error.message, error.details);
    return nieuw;
  }, []);

  const saveKlant = useCallback(async (rec: LeaseKlant) => {
    updateKlanten(klantRef.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('lease_klanten').upsert(rec);
    if (error) console.error('lease_klanten upsert fout:', error.message, error.details);
  }, []);

  const removeKlant = useCallback(async (id: string) => {
    updateKlanten(klantRef.current.filter((r) => r.id !== id));
    const { error } = await supabase.from('lease_klanten').delete().eq('id', id);
    if (error) console.error('lease_klanten delete fout:', error.message);
  }, []);

  return {
    aanvragen, klanten, loading,
    addAanvraag, saveAanvraag, removeAanvraag,
    addKlant, saveKlant, removeKlant,
  };
}
