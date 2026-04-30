'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { section: 'Overzicht', items: [{ href: '/dashboard', label: 'Dashboard', icon: '🏠' }] },
  { section: 'Zoeken', items: [{ href: '/zoeken', label: 'Zoekopdrachten', icon: '🔍' }] },
  { section: 'Verkoop', items: [{ href: '/lease', label: 'Lease aanvragen', icon: '📋' }] },
  {
    section: 'Operations',
    items: [
      { href: '/aftersales', label: 'After Sales', icon: '🚗' },
      { href: '/btw', label: 'BTW / Credit', icon: '💶' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const initials = user?.email?.charAt(0).toUpperCase() ?? '?';
  const naam = user?.email?.split('@')[0] ?? '–';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <svg viewBox="0 0 88.7 120.8" className={styles.shield} xmlns="http://www.w3.org/2000/svg">
          <path fill="#921B39" d="M88.7,0H0v62c0,7.8,1.3,24.6,11.4,35.4c12,12.9,27.6,20.8,30.6,22.3l2.3,1.1l2.3-1.1c3-1.5,18.6-9.4,30.6-22.3C87.2,86.6,88.5,69.8,88.7,62V0z" />
        </svg>
        <span className={styles.logoText}>PEPE <span>Flow</span></span>
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
