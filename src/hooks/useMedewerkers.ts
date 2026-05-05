'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { INKOPERS_DEFAULT } from '@/lib/constants';

export interface Medewerker {
  id: string;
  naam: string;
  email: string;
  actief: boolean;
}

export function useMedewerkers() {
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    supabase
      .from('medewerkers')
      .select('id, naam, email, actief')
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
