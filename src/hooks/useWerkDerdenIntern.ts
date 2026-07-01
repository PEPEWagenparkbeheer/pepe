'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { WerkDerdenIntern } from '@/types';

/**
 * useWerkDerdenIntern()
 * Interne, vooraf afgesproken verkoopprijs/marge per werk-derden-melding.
 *
 * Leest uit public.werk_derden_intern — een PEPE-only tabel (RLS: is_pepe()).
 * Partners krijgen door RLS een lege set terug; deze hook hoort dan ook alleen
 * in het PEPE-overzicht gebruikt te worden. De partner ziet deze prijs nooit,
 * ook niet in de netwerk-payload.
 */
export function useWerkDerdenIntern() {
  const [map, setMap] = useState<Record<string, WerkDerdenIntern>>({});
  const [loading, setLoading] = useState(true);
  const ref = useRef<Record<string, WerkDerdenIntern>>({});

  function apply(next: Record<string, WerkDerdenIntern>) {
    ref.current = next;
    setMap(next);
  }

  useEffect(() => {
    let actief = true;
    supabase
      .from('werk_derden_intern')
      .select('*')
      .then(({ data, error }) => {
        if (!actief) return;
        if (!error && data) {
          const next: Record<string, WerkDerdenIntern> = {};
          for (const row of data as WerkDerdenIntern[]) next[row.werk_derden_id] = row;
          apply(next);
        }
        setLoading(false);
      });
    return () => {
      actief = false;
    };
  }, []);

  /** Slaat de interne prijs op (upsert). `bijgewerktDoor` = medewerkernaam. */
  const saveIntern = useCallback(
    async (
      werkDerdenId: string,
      data: Pick<WerkDerdenIntern, 'marge_type' | 'marge_waarde' | 'btw_pct' | 'notitie'>,
      bijgewerktDoor?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const row: WerkDerdenIntern = {
        werk_derden_id: werkDerdenId,
        marge_type: data.marge_type,
        marge_waarde: data.marge_waarde,
        btw_pct: data.btw_pct,
        notitie: data.notitie,
        bijgewerkt_op: new Date().toISOString(),
        bijgewerkt_door: bijgewerktDoor,
      };
      const { error } = await supabase
        .from('werk_derden_intern')
        .upsert(row, { onConflict: 'werk_derden_id' });
      if (error) return { ok: false, error: error.message };
      apply({ ...ref.current, [werkDerdenId]: row });
      return { ok: true };
    },
    [],
  );

  /** Verwijdert de interne prijs (bijv. leeggemaakt). */
  const removeIntern = useCallback(async (werkDerdenId: string): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.from('werk_derden_intern').delete().eq('werk_derden_id', werkDerdenId);
    if (error) return { ok: false, error: error.message };
    const next = { ...ref.current };
    delete next[werkDerdenId];
    apply(next);
    return { ok: true };
  }, []);

  return { intern: map, loading, saveIntern, removeIntern };
}
