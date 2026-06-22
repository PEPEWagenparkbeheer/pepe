'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/clientAuth';
import type { Lead, LeadStatus } from '@/types';

const SK = 'pepe_leads_v1';

function deserialize(r: Record<string, unknown>): Lead {
  return {
    ...(r as unknown as Lead),
    gearchiveerd: r.gearchiveerd === true || r.gearchiveerd === 'true',
    status: (r.status as LeadStatus) ?? 'nieuw',
    veld_meta: (r.veld_meta as Record<string, { op: string; door: string }>) ?? {},
  };
}

function localLoad(): Lead[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSave(data: Lead[]) {
  try { localStorage.setItem(SK, JSON.stringify(data)); } catch { /* leeg */ }
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [gebruiker, setGebruiker] = useState('');
  const ref = useRef<Lead[]>([]);
  const gebruikerRef = useRef('');

  function update(next: Lead[]) {
    ref.current = next;
    setLeads(next);
    localSave(next);
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

    const lokaal = localLoad();
    if (lokaal.length) { ref.current = lokaal; setLeads(lokaal); }

    supabase.from('leads').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) update((data as Record<string, unknown>[]).map(deserialize));
        setLoading(false);
      });

    const ch = supabase.channel(`leads_realtime_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
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

  const add = useCallback(async (rec: Omit<Lead, 'id' | 'created_at'>) => {
    const nieuw: Lead = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    update([nieuw, ...ref.current]);
    const { error } = await supabase.from('leads').insert(nieuw);
    if (error) console.error('leads insert fout:', error.message);
    return nieuw;
  }, []);

  const save = useCallback(async (rec: Lead) => {
    update(ref.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('leads').upsert(rec);
    if (error) console.error('leads upsert fout:', error.message);
  }, []);

  const remove = useCallback(async (id: string) => {
    update(ref.current.filter((r) => r.id !== id));
    await supabase.from('leads').delete().eq('id', id);
  }, []);

  const archiveer = useCallback(async (id: string) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;
    await save({ ...rec, gearchiveerd: true });
  }, [save]);

  const setStatus = useCallback(async (id: string, status: LeadStatus) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;
    const nu = new Date().toISOString();
    const naam = gebruikerRef.current || '?';
    const meta = { ...(rec.veld_meta ?? {}), [status]: { op: nu, door: naam } };
    await save({ ...rec, status, veld_meta: meta });
  }, [save]);

  const oppakken = useCallback(async (id: string) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;
    const naam = gebruikerRef.current || '?';
    await save({ ...rec, status: 'opgepakt', wie: rec.wie || naam });
  }, [save]);

  const akkoord = useCallback(async (id: string) => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return;

    // Lead op verkocht zetten
    const nu = new Date().toISOString();
    const naam = gebruikerRef.current || '?';
    const meta = { ...(rec.veld_meta ?? {}), verkocht: { op: nu, door: naam } };
    await save({ ...rec, status: 'verkocht', gearchiveerd: true, veld_meta: meta });

    // AfterSales record aanmaken als type 'voorraad'
    const autoDelen = rec.auto.trim().split(/\s+/);
    const merk  = autoDelen[0] ?? '';
    const model = autoDelen.slice(1).join(' ');
    await supabase.from('after_sales').insert({
      kenteken: '',
      merk,
      model,
      klant: rec.klant_naam,
      email_klant: rec.email ?? null,
      type: 'voorraad',
      binnen: false,
      gearchiveerd: false,
    });
  }, [save]);

  const merge = useCallback(async (primaryId: string, secondaryId: string): Promise<Lead> => {
    const res = await fetch('/api/leads/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ primaryId, secondaryId }),
    });
    const data = (await res.json()) as { ok?: boolean; primary?: Lead; secondaryId?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Samenvoegen mislukt');
    // Verwijder secondary uit lokale state, update primary
    setLeads((prev) =>
      prev
        .filter((l) => l.id !== data.secondaryId)
        .map((l) => (l.id === primaryId ? (data.primary as Lead) : l)),
    );
    return data.primary as Lead;
  }, []);

  return { leads, loading, gebruiker, add, save, remove, archiveer, setStatus, oppakken, akkoord, merge };
}
