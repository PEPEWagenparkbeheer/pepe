'use client';

import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';
import LoginScreen from './LoginScreen';
import Sidebar from './Sidebar';
import styles from './AppLayout.module.css';

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

  if (hideSidebar) {
    return <>{children}</>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
