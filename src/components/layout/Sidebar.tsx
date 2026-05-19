'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { section: 'Overzicht', items: [{ href: '/dashboard', label: 'Dashboard', icon: '🏠' }] },
  {
    section: 'Verkoop',
    items: [
      { href: '/zoeken', label: 'Zoekopdrachten', icon: '🔍' },
      { href: '/leads', label: 'Leads', icon: '📞' },
      { href: '/lease', label: 'Lease aanvragen', icon: '📋' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { href: '/aftersales', label: 'After Sales', icon: '🚗' },
      { href: '/inname', label: 'Inname', icon: '📋' },
      { href: '/btw', label: 'BTW / Credit', icon: '💶' },
    ],
  },
  { section: 'Tools', items: [{ href: '/tools', label: 'Tools', icon: '🔧' }] },
  { section: 'Systeem', items: [{ href: '/instellingen', label: 'Instellingen', icon: '⚙️' }] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const initials = user?.email?.charAt(0).toUpperCase() ?? '?';
  const naam = user?.email?.split('@')[0] ?? '–';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <img src="/pepe-logo-cmyk-wit.svg" alt="PEPE" className={styles.logoImg} />
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ section, items }) => (
          <div key={section}>
            <div className={styles.section}>{section}</div>
            {items.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.item} ${pathname === href || pathname.startsWith(href + '/') ? styles.active : ''}`}
              >
                <span className={styles.icon}>{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.syncRow}>
          <span className={styles.syncDot} />
          <span className={styles.syncLabel}>Verbonden</span>
        </div>
      </div>

      <div className={styles.userBadge}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.userName}>{naam}</div>
        <button className={styles.logoutBtn} onClick={signOut} title="Uitloggen">
          ↩
        </button>
      </div>
    </aside>
  );
}
