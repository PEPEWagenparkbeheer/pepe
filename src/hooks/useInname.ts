'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InnameFormulier } from '@/types';

const SK = 'pepe_inname_v1';

function localLoad(): InnameFormulier[] {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : []; } catch { return []; }
}
function localSave(data: InnameFormulier[]) {
  try { localStorage.setItem(SK, JSON.stringify(data)); } catch { /* leeg */ }
}

function sanitizeDates(form: Omit<InnameFormulier, 'id' | 'created_at'>) {
  return {
    ...form,
    datum:               form.datum               || null,
    apk_geldig_tot:      form.apk_geldig_tot      || null,
    laatste_beurt_datum: form.laatste_beurt_datum  || null,
  };
}

export function useInname(afterSalesId?: string) {
  const [formulieren, setFormulieren] = useState<InnameFormulier[]>([]);
  const [ongekoppeld, setOngekoppeld] = useState<InnameFormulier[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<InnameFormulier[]>([]);

  function update(next: InnameFormulier[]) {
    ref.current = next;
    setFormulieren(next);
    localSave(next);
  }

  useEffect(() => {
    if (afterSalesId) {
      const lokaal = localLoad().filter(f => f.after_sales_id === afterSalesId);
      if (lokaal.length) { ref.current = lokaal; setFormulieren(lokaal); }
      supabase
        .from('inname_formulieren')
        .select('*')
        .eq('after_sales_id', afterSalesId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) update(data as InnameFormulier[]);
          setLoading(false);
        });
    } else {
      // Laad ongekoppelde innames (after_sales_id IS NULL)
      supabase
        .from('inname_formulieren')
        .select('*')
        .is('after_sales_id', null)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setOngekoppeld((data ?? []) as InnameFormulier[]);
          setLoading(false);
        });
    }
  }, [afterSalesId]);

  const submit = useCallback(async (
    form: Omit<InnameFormulier, 'id' | 'created_at'>,
  ): Promise<{ ok: boolean; after_sales_id?: string; ongekoppeld?: boolean; error?: string }> => {
    const kenteken = (form.kenteken ?? '').trim().toUpperCase().replace(/-/g, '');
    const meldcode = (form.meldcode ?? '').trim();

    // Zoek bestaande after_sales kaart
    let asId: string | undefined;
    if (kenteken) {
      const { data: asRecs } = await supabase
        .from('after_sales')
        .select('id')
        .ilike('kenteken', kenteken)
        .eq('gearchiveerd', false)
        .limit(1);
      if (asRecs?.[0]) {
        asId = asRecs[0].id;
        await supabase.from('after_sales').update({
          binnen: true,
          binnen_op: form.datum ?? new Date().toISOString().slice(0, 10),
        }).eq('id', asId);
      }
    }

    // APK terugschrijven als gekoppeld en gevuld
    if (asId && form.apk_geldig_tot) {
      const d = form.apk_geldig_tot;
      const apkFmt = d.length === 10
        ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`
        : d;
      await supabase.from('after_sales').update({ apk: apkFmt }).eq('id', asId);
    }

    // Sla inname op — zonder after_sales_id als niet gevonden (ongekoppeld)
    const cleaned = sanitizeDates(form);
    const { data: result, error } = await supabase
      .from('inname_formulieren')
      .insert({ ...cleaned, after_sales_id: asId ?? null })
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    const rec = result as InnameFormulier;
    if (!asId) {
      setOngekoppeld(prev => [rec, ...prev]);
    }
    update([rec, ...ref.current]);
    return { ok: true, after_sales_id: asId, ongekoppeld: !asId };
  }, []);

  // Maak een nieuw AfterSales record aan voor een ongekoppelde inname
  const koppelAan = useCallback(async (inname: InnameFormulier): Promise<{ ok: boolean; error?: string }> => {
    const kenteken = (inname.kenteken ?? '').trim().toUpperCase().replace(/-/g, '');
    const meldcode = (inname.meldcode ?? '').trim();
    const merkModel = (inname.merk_type ?? '').trim().split(' ');

    const { data: nieuw, error: asErr } = await supabase
      .from('after_sales')
      .insert({
        kenteken: kenteken || meldcode || '',
        merk: merkModel[0] ?? '',
        model: merkModel.slice(1).join(' ') ?? '',
        type: 'nl',
        binnen: true,
        binnen_op: inname.datum ?? new Date().toISOString().slice(0, 10),
        gearchiveerd: false,
      })
      .select('id')
      .single();

    if (asErr) return { ok: false, error: asErr.message };

    const { error: linkErr } = await supabase
      .from('inname_formulieren')
      .update({ after_sales_id: nieuw.id })
      .eq('id', inname.id);

    if (linkErr) return { ok: false, error: linkErr.message };

    setOngekoppeld(prev => prev.filter(f => f.id !== inname.id));
    return { ok: true };
  }, []);

  const latest = formulieren[0] ?? null;

  return { formulieren, latest, ongekoppeld, loading, submit, koppelAan };
}
