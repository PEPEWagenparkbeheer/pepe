'use client';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginScreen from '@/components/layout/LoginScreen';

export default function ZoekenMobielLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
    };
  }, []);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 32 }}>🔍</span>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <>{children}</>;
}