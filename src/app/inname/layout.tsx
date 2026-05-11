'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginScreen from '@/components/layout/LoginScreen';

export default function InnameLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Overschrijf de globale overflow:hidden van de body (die voor de sidebar-layout is)
  useEffect(() => {
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.height = 'auto';
    return () => {
      document.documentElement.style.overflowY = '';
      document.body.style.overflowY = '';
      document.body.style.height = '';
      document.documentElement.style.height = '';
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
