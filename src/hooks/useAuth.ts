'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

const ONTHOUD_KEY = 'pepe_onthoud';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Als "Onthoud mij" niet is aangevinkt én er is een sessie die van vóór deze browsersessie is,
      // dan uitloggen zodat de gebruiker opnieuw moet inloggen.
      const onthoud = typeof window !== 'undefined' && localStorage.getItem(ONTHOUD_KEY) === '1';
      const sessieVlag = typeof window !== 'undefined' && sessionStorage.getItem('pepe_ingelogd') === '1';

      if (data.session && !onthoud && !sessieVlag) {
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string, onthoud: boolean) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (onthoud) {
      localStorage.setItem(ONTHOUD_KEY, '1');
    } else {
      localStorage.removeItem(ONTHOUD_KEY);
    }
    // Markeer dat de gebruiker in deze browsersessie is ingelogd
    sessionStorage.setItem('pepe_ingelogd', '1');
  }

  async function signOut() {
    localStorage.removeItem(ONTHOUD_KEY);
    sessionStorage.removeItem('pepe_ingelogd');
    await supabase.auth.signOut();
  }

  return { session, user, loading, signIn, signOut };
}
