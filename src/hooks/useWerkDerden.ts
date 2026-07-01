'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/clientAuth';
import type { WerkDerdenRecord, WerkDerdenStatus, WerkRegel } from '@/types';
import { isPepeOpdracht } from '@/lib/werk-derden/richting';

const CACHE_KEY = 'pepe_wd_v1';

// Kolomlijst voor partner-queries: marge_type / marge_waarde / verkoop_bedrag worden
// weggelaten zodat de partner de intern afgesproken verkoopprijs NOOIT te zien krijgt,
// ook niet in de browser JS-heap of via realtime events.
const PARTNER_COLS = [
  'id', 'created_at', 'partner', 'kenteken', 'meldcode', 'merk', 'model', 'klant',
  'toegevoegd_door', 'regels', 'btw_pct', 'inkoop_bedrag', 'bijlage_storage_path',
  'status', 'afkeur_reden', 'notitie', 'goedgekeurd_op', 'goedgekeurd_door',
  'afgekeurd_op', 'afgekeurd_door', 'afgerond_op', 'afgerond_door', 'gefactureerd_op',
  'hubspot_deal_id', 'twinfield_invoice_id', 'after_sales_id', 'bestemming', 'voorwaarden',
].join(',');

function euro(n: number): string {
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}

function deserialize(r: Record<string, unknown>): WerkDerdenRecord {
  return {
    ...(r as unknown as WerkDerdenRecord),
    status: (r.status as WerkDerdenStatus) ?? 'open',
    regels: Array.isArray(r.regels) ? r.regels : [],
    bestemming: ((r.bestemming as string) ?? 'doorbelasten') as import('@/types').WerkDerdenBestemming,
  };
}

/** Fire-and-forget notificatie-mail bij status-overgang; faalt stil. */
function notify(id: string, event: 'ingediend' | 'opdracht' | 'goedgekeurd' | 'geaccepteerd' | 'afgekeurd') {
  void (async () => {
    await fetch('/api/werk-derden/notify', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, event }),
    });
  })().catch(() => {});
}

function cacheLoad(): WerkDerdenRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WerkDerdenRecord[]) : [];
  } catch {
    return [];
  }
}

function cacheSave(records: WerkDerdenRecord[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records));
  } catch {
    // quota exceeded — ignore
  }
}

/**
 * useWerkDerden(wie?, rol?)
 * - wie  = partner-naam: filtert op eigen meldingen
 * - rol  = 'pepe': geeft alle meldingen (PEPE-overzicht)
 */
export function useWerkDerden(wie?: string, rol?: 'pepe') {
  const [records, setRecords] = useState<WerkDerdenRecord[]>(cacheLoad);
  const [loading, setLoading] = useState(true);
  const ref = useRef<WerkDerdenRecord[]>([]);

  function update(next: WerkDerdenRecord[]) {
    ref.current = next;
    cacheSave(next);
    setRecords(next);
  }

  useEffect(() => {
    const isPartner = !!(wie && rol !== 'pepe');
    let query = supabase
      .from('werk_derden')
      .select(isPartner ? PARTNER_COLS : '*')
      .order('created_at', { ascending: false });
    if (isPartner) {
      query = query.eq('partner', wie);
    }

    query.then(({ data, error }) => {
      if (!error && data) update((data as unknown as Record<string, unknown>[]).map(deserialize));
      setLoading(false);
    });

    const channelId = `wd_realtime_${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'werk_derden' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          let raw = payload.new as Record<string, unknown>;
          // Strip interne marge-velden zodat ze nooit in de JS-heap van de partner belanden
          if (isPartner) {
            raw = { ...raw };
            delete (raw as { marge_type?: unknown }).marge_type;
            delete (raw as { marge_waarde?: unknown }).marge_waarde;
            delete (raw as { verkoop_bedrag?: unknown }).verkoop_bedrag;
          }
          const rec = deserialize(raw);
          if (isPartner && rec.partner !== wie) return;
          update(
            ref.current.some((r) => r.id === rec.id)
              ? ref.current.map((r) => (r.id === rec.id ? rec : r))
              : [rec, ...ref.current],
          );
        } else if (payload.eventType === 'DELETE') {
          update(ref.current.filter((r) => r.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [wie, rol]);

  // Actieve records die aandacht vereisen
  const actieCount = records.filter((r) => r.status === 'open').length;

  const addRecord = useCallback(
    async (rec: Omit<WerkDerdenRecord, 'id' | 'created_at'>): Promise<{ ok: boolean; error?: string }> => {
      const { data, error } = await supabase
        .from('werk_derden')
        .insert(rec)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      const inserted = deserialize(data as Record<string, unknown>);
      update([inserted, ...ref.current]);
      // PEPE-opdracht → partner moet accepteren (mail naar partner);
      // partner-indiening → PEPE moet goedkeuren (mail naar info@).
      notify(inserted.id, isPepeOpdracht(inserted) ? 'opdracht' : 'ingediend');
      return { ok: true };
    },
    [],
  );

  const updateRecord = useCallback(
    async (id: string, patch: Partial<WerkDerdenRecord>): Promise<{ ok: boolean; error?: string }> => {
      const { error } = await supabase
        .from('werk_derden')
        .update(patch)
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      update(ref.current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { ok: true };
    },
    [],
  );

  const deleteRecord = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { error } = await supabase
        .from('werk_derden')
        .delete()
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      update(ref.current.filter((r) => r.id !== id));
      return { ok: true };
    },
    [],
  );

  const setGoedgekeurd = useCallback(
    async (
      id: string,
      opties?: { regels?: WerkRegel[]; voorwaarden?: string; klant?: string; door?: string },
    ) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'goedgekeurd',
        goedgekeurd_op: new Date().toISOString(),
      };
      if (opties?.door) patch.goedgekeurd_door = opties.door;
      if (opties?.regels) {
        patch.regels = opties.regels;
        patch.inkoop_bedrag = opties.regels.reduce((s, r) => s + r.bedrag, 0);
      }
      if (opties?.voorwaarden != null) patch.voorwaarden = opties.voorwaarden;
      if (opties?.klant) patch.klant = opties.klant;
      const result = await updateRecord(id, patch);
      if (result.ok) notify(id, 'goedgekeurd');
      return result;
    },
    [updateRecord],
  );

  /**
   * Partner accepteert een PEPE-opdracht. Gaat direct naar 'goedgekeurd'
   * (klaar om te factureren). Bij een aangepast bedrag worden regels +
   * inkoop_bedrag overschreven en wordt de afwijking (€origineel → €nieuw)
   * als gestructureerde regel in `voorwaarden` vastgelegd, zodat PEPE die
   * overal terugziet. Mailt PEPE via het 'geaccepteerd'-event.
   */
  const setGeaccepteerd = useCallback(
    async (
      id: string,
      opties: { door: string; regels?: WerkRegel[]; voorwaarden?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      const huidig = ref.current.find((r) => r.id === id);
      const patch: Partial<WerkDerdenRecord> = {
        status: 'goedgekeurd',
        goedgekeurd_op: new Date().toISOString(),
        goedgekeurd_door: opties.door,
      };
      if (opties.regels) {
        const nieuwBedrag = opties.regels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0);
        const origineel = huidig?.inkoop_bedrag ?? null;
        patch.regels = opties.regels;
        patch.inkoop_bedrag = nieuwBedrag;
        const stukken: string[] = [];
        if (origineel != null && Math.abs(origineel - nieuwBedrag) > 0.005) {
          const verschil = nieuwBedrag - origineel;
          const teken = verschil > 0 ? '+' : '−';
          stukken.push(`Bedrag aangepast: ${euro(origineel)} → ${euro(nieuwBedrag)} (afwijking ${teken}${euro(Math.abs(verschil))})`);
        }
        if (opties.voorwaarden?.trim()) stukken.push(opties.voorwaarden.trim());
        if (stukken.length) patch.voorwaarden = stukken.join('\n\n');
      } else if (opties.voorwaarden?.trim()) {
        patch.voorwaarden = opties.voorwaarden.trim();
      }
      const result = await updateRecord(id, patch);
      if (result.ok) notify(id, 'geaccepteerd');
      return result;
    },
    [updateRecord],
  );

  const setAfgekeurd = useCallback(
    async (id: string, reden: string, door?: string) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'afgekeurd',
        afkeur_reden: reden,
        afgekeurd_op: new Date().toISOString(),
      };
      if (door) patch.afgekeurd_door = door;
      const result = await updateRecord(id, patch);
      if (result.ok) notify(id, 'afgekeurd');
      return result;
    },
    [updateRecord],
  );

  const setAfgerond = useCallback(
    async (id: string, door?: string) => {
      const patch: Partial<WerkDerdenRecord> = {
        status: 'afgerond',
        afgerond_op: new Date().toISOString(),
      };
      if (door) patch.afgerond_door = door;
      return updateRecord(id, patch);
    },
    [updateRecord],
  );

  const setKlaarGemeld = useCallback(
    async (id: string) => updateRecord(id, { status: 'klaar_gemeld' }),
    [updateRecord],
  );

  const setGefactureerd = useCallback(
    async (id: string, verkoop_bedrag: number): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch('/api/werk-derden/factureren', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, verkoop_bedrag }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) return { ok: false, error: json.error ?? 'Onbekende fout' };
      update(
        ref.current.map((r) =>
          r.id === id
            ? { ...r, status: 'gefactureerd', verkoop_bedrag, gefactureerd_op: new Date().toISOString() }
            : r,
        ),
      );
      return { ok: true };
    },
    [],
  );

  const bijlageUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('werk-derden')
      .createSignedUrl(storagePath, 60 * 60);
    if (error) {
      console.error('werk_derden bijlage url fout:', error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return {
    records,
    loading,
    actieCount,
    addRecord,
    updateRecord,
    deleteRecord,
    setGoedgekeurd,
    setGeaccepteerd,
    setAfgerond,
    setAfgekeurd,
    setKlaarGemeld,
    setGefactureerd,
    bijlageUrl,
  };
}


