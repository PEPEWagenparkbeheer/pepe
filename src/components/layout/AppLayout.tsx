'use client';

import { useAuth } from '@/hooks/useAuth';
import LoginScreen from './LoginScreen';
import Sidebar from './Sidebar';
import styles from './AppLayout.module.css';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </>
  );
}
