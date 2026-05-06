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
    veld_meta: (r.veld_meta as Record<string, { op: string; door: string }>) ?? {},
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
  const [gebruiker, setGebruiker] = useState('');
  const [binnenOpMap, setBinnenOpMap] = useState<Record<string, string>>({});
  const ref = useRef<BtwRecord[]>([]);
  const gebruikerRef = useRef('');

  function update(next: BtwRecord[]) {
    ref.current = next;
    setRecords(next);
    localSave(next);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const naam = u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? '?';
      gebruikerRef.current = naam;
      setGebruiker(naam);
    });

    const lokaal = localLoad();
    if (lokaal.length) { ref.current = lokaal; setRecords(lokaal); }

    Promise.all([
      supabase.from('btw_records').select('*').order('created_at', { ascending: true }),
      supabase.from('after_sales').select('kenteken, binnen_op'),
    ]).then(([btwRes, asRes]) => {
      if (!btwRes.error && btwRes.data) update((btwRes.data as Record<string, unknown>[]).map(deserialize));
      if (!asRes.error && asRes.data) {
        const map: Record<string, string> = {};
        for (const r of asRes.data as { kenteken?: string; binnen_op?: string }[]) {
          if (r.kenteken && r.binnen_op) map[r.kenteken.toUpperCase()] = r.binnen_op;
        }
        setBinnenOpMap(map);
      }
      setLoading(false);
    });
  }, []);

  const add = useCallback(async (rec: Omit<BtwRecord, 'id' | 'created_at'>) => {
    const nieuw: BtwRecord = { ...rec, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    update([nieuw, ...ref.current]);
    const { error } = await supabase.from('btw_records').insert(nieuw);
    if (error) console.error('btw_records insert fout:', error.message, error.details);
    return nieuw;
  }, []);

  const save = useCallback(async (rec: BtwRecord) => {
    update(ref.current.map((r) => (r.id === rec.id ? rec : r)));
    const { error } = await supabase.from('btw_records').upsert(rec);
    if (error) console.error('btw_records upsert fout:', error.message, error.details);
  }, []);

  const remove = useCallback(async (id: string) => {
    update(ref.current.filter((r) => r.id !== id));
    const { error } = await supabase.from('btw_records').delete().eq('id', id);
    if (error) console.error('btw_records delete fout:', error.message);
  }, []);

  // toggle: werkt veld_meta bij, synct gelangenbest met after_sales, en archiveert automatisch.
  // Geeft true terug als het record gearchiveerd is (voor confetti in de component).
  const toggle = useCallback(async (id: string, veld: keyof BtwRecord): Promise<boolean> => {
    const rec = ref.current.find((r) => r.id === id);
    if (!rec) return false;

    const nieuweWaarde = !rec[veld];
    const nu = new Date().toISOString();
    const naam = gebruikerRef.current || '?';

    const meta = { ...(rec.veld_meta ?? {}) };
    if (nieuweWaarde) {
      meta[String(veld)] = { op: nu, door: naam };
    } else {
      delete meta[String(veld)];
    }

    const updatedRec: BtwRecord = { ...rec, [veld]: nieuweWaarde, veld_meta: meta };

    // Gelangenbest_verstuurd synchroniseren met after_sales
    if (veld === 'gelangenbest_verstuurd' && rec.kenteken) {
      try {
        const { data: asData } = await supabase
          .from('after_sales')
          .select('id, veld_meta')
          .ilike('kenteken', rec.kenteken)
          .maybeSingle();

        if (asData) {
          const asMeta = { ...((asData.veld_meta as Record<string, unknown>) ?? {}) };
          if (nieuweWaarde) {
            asMeta['gelangenbest'] = { op: nu, door: naam };
          } else {
            delete asMeta['gelangenbest'];
          }
          await supabase.from('after_sales').update({
            gelangenbest: nieuweWaarde,
            veld_meta: asMeta,
          }).eq('id', asData.id);
        }
      } catch { /* leeg */ }
    }

    // Auto-archiveer logica
    // Import (type='btw'): archiveer zodra geld van dealer is ontvangen
    if (veld === 'geld_van_dealer' && nieuweWaarde && rec.type === 'btw') {
      await save({ ...updatedRec, gearchiveerd: true });
      return true;
    }

    // Credit (type='credit'): archiveer zodra alle gevulde bedragen zijn afgevinkt
    if (rec.type === 'credit') {
      const heeftLm = (rec.lm_bedrag ?? 0) > 0;
      const heeftDealer = (rec.dealer_bedrag ?? 0) > 0;

      if (nieuweWaarde && (heeftLm || heeftDealer)) {
        const nieuweLm = veld === 'geld_van_lm' ? true : !!rec.geld_van_lm;
        const nieuweDealer = veld === 'geld_van_dealer' ? true : !!rec.geld_van_dealer;
        const lmKlaar = !heeftLm || nieuweLm;
        const dealerKlaar = !heeftDealer || nieuweDealer;

        if (lmKlaar && dealerKlaar) {
          await save({ ...updatedRec, gearchiveerd: true });
          return true;
        }
      }
    }

    await save(updatedRec);
    return false;
  }, [save]);

  return { records, loading, gebruiker, binnenOpMap, add, save, remove, toggle };
}
