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

  const hideSidebar = SIDEBAR_HIDDEN.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (hideSidebar) return <>{children}</>;

  if (!user) return <LoginScreen />;

  // Partner-portaal: aparte view zonder sidebar
  if (user.user_metadata?.rol === 'partner') {
    return <PartnerPage wie={String(user.user_metadata.wie ?? '')} />;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
