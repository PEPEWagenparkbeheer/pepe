'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { INKOPERS_DEFAULT } from '@/lib/constants';

export interface Medewerker {
  id: string;
  naam: string;
  email: string;
  actief: boolean;
  volledige_naam?: string | null;
  mobiel?: string | null;
  handtekening_foto_url?: string | null;
}

export function useMedewerkers() {
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    supabase
      .from('medewerkers')
      .select('id, naam, email, actief, volledige_naam, mobiel, handtekening_foto_url')
      .eq('actief', true)
      .order('naam')
      .then(({ data }) => {
        setMedewerkers(data ?? []);
        setLaden(false);
      });
  }, []);

  const namen: string[] =
    medewerkers.length > 0 ? medewerkers.map((m) => m.naam) : INKOPERS_DEFAULT;

  return { medewerkers, namen, laden, setMedewerkers };
}
