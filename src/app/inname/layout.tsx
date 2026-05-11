'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginScreen from '@/components/layout/LoginScreen';

export default function InnameLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Overschrijf de globale overflow:hidden van de body
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';
    // Zorg dat de pagina altijd bovenaan links begint bij openen
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
    };
  }, []);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(146,25,57,.2)', borderTopColor: '#921939', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return <>{children}</>;
}
