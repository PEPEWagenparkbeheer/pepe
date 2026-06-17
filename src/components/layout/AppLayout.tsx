'use client';

import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import LoginScreen from './LoginScreen';
import Sidebar from './Sidebar';
import styles from './AppLayout.module.css';

const PartnerPage = dynamic(() => import('@/components/partner/PartnerPage'), { ssr: false });

const SIDEBAR_HIDDEN = ['/inname'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // Eerst auth, dan pas routing. Voorheen werd /inname (SIDEBAR_HIDDEN) vóór de
  // login-check gerenderd; nu vereist elke route eerst een ingelogde gebruiker.
  if (!user) return <LoginScreen />;

  const hideSidebar = SIDEBAR_HIDDEN.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (hideSidebar) return <>{children}</>;

  // Partner-portaal: aparte view zonder sidebar. rol/wie uit app_metadata
  // (niet door de gebruiker zelf te wijzigen — zie partner-RLS).
  if (user.app_metadata?.rol === 'partner') {
    return <PartnerPage wie={String(user.app_metadata.wie ?? '')} />;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
