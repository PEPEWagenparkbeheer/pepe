'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { WIE_DEFAULT } from '@/lib/constants';

export interface PartnerLijstItem {
  id: string;
  naam: string;
  gearchiveerd: boolean;
  created_at?: string;
}

/**
 * Centrale lijst van rijklaar-partners uit Supabase.
 * Realtime updates zodat wijzigingen in Instellingen direct zichtbaar zijn.
 */
export function usePartnerLijst() {
  const [partners, setPartners] = useState<PartnerLijstItem[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let actief = true;

    async function laad() {
      const { data } = await supabase
        .from('partner_lijst')
        .select('*')
        .eq('gearchiveerd', false)
        .order('naam');
      if (actief) {
        setPartners((data as PartnerLijstItem[]) ?? []);
        setLaden(false);
      }
    }
    laad();

    const ch = supabase
      .channel(`partner_lijst_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_lijst' }, () => laad())
      .subscribe();

    return () => {
      actief = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const namen = partners.length > 0 ? partners.map((p) => p.naam) : WIE_DEFAULT;

  async function voegToe(naam: string): Promise<{ error?: string }> {
    const trimmed = naam.trim();
    if (!trimmed) return { error: 'Naam is leeg' };
    if (partners.some((p) => p.naam.toLowerCase() === trimmed.toLowerCase())) {
      return { error: 'Bestaat al' };
    }
    const { error } = await supabase.from('partner_lijst').insert({ naam: trimmed });
    return error ? { error: error.message } : {};
  }

  async function hernoem(id: string, naam: string): Promise<{ error?: string }> {
    const trimmed = naam.trim();
    if (!trimmed) return { error: 'Naam is leeg' };
    const { error } = await supabase.from('partner_lijst').update({ naam: trimmed }).eq('id', id);
    return error ? { error: error.message } : {};
  }

  async function verwijder(id: string): Promise<{ error?: string }> {
    // Soft-delete via gearchiveerd, niet hard-delete (kan gekoppeld zijn aan auto's)
    const { error } = await supabase.from('partner_lijst').update({ gearchiveerd: true }).eq('id', id);
    return error ? { error: error.message } : {};
  }

  return { partners, namen, laden, voegToe, hernoem, verwijder };
}
