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

export function useInname(afterSalesId?: string) {
  const [formulieren, setFormulieren] = useState<InnameFormulier[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<InnameFormulier[]>([]);

  function update(next: InnameFormulier[]) {
    ref.current = next;
    setFormulieren(next);
    localSave(next);
  }

  useEffect(() => {
    if (!afterSalesId) { setLoading(false); return; }

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
  }, [afterSalesId]);

  const submit = useCallback(async (
    form: Omit<InnameFormulier, 'id' | 'created_at'>,
  ): Promise<{ ok: boolean; after_sales_id?: string; error?: string }> => {
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
        // Zet binnen + binnen_op
        await supabase.from('after_sales').update({
          binnen: true,
          binnen_op: form.datum ?? new Date().toISOString().slice(0, 10),
        }).eq('id', asId);
      }
    }

    // Als niet gevonden: maak nieuw after_sales record
    if (!asId) {
      const merkModel = (form.merk_type ?? '').trim().split(' ');
      const { data: nieuw, error: asErr } = await supabase
        .from('after_sales')
        .insert({
          kenteken: kenteken || meldcode || '',
          merk: merkModel[0] ?? '',
          model: merkModel.slice(1).join(' ') ?? '',
          type: 'nl',
          binnen: true,
          binnen_op: form.datum ?? new Date().toISOString().slice(0, 10),
          gearchiveerd: false,
        })
        .select('id')
        .single();
      if (asErr) return { ok: false, error: asErr.message };
      asId = nieuw.id;
    }

    // APK terugschrijven naar after_sales als gevuld
    if (asId && form.apk_geldig_tot) {
      const d = form.apk_geldig_tot;
      const apkFmt = d.length === 10
        ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`
        : d;
      await supabase.from('after_sales').update({ apk: apkFmt }).eq('id', asId);
    }

    // Upsert inname formulier
    const { data: result, error } = await supabase
      .from('inname_formulieren')
      .insert({ ...form, after_sales_id: asId })
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    update([result as InnameFormulier, ...ref.current]);
    return { ok: true, after_sales_id: asId };
  }, []);

  const latest = formulieren[0] ?? null;

  return { formulieren, latest, loading, submit };
}
