'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import type { UitgaandeFactuur, FactuurStatus, FactuurType } from '@/types/factuur';
import FactuurModal from './FactuurModal';
import styles from './Facturatie.module.css';

const STATUS_LABEL: Record<FactuurStatus, string> = {
  concept: 'Concept',
  aanvullen: 'Aanvullen',
  ter_controle: 'Ter controle',
  definitief: 'Definitief',
  verzonden: 'Verzonden',
  geannuleerd: 'Geannuleerd',
};

const TYPE_LABEL: Record<FactuurType, string> = {
  auto: 'Auto',
  wagenparkbeheer: 'Wagenparkbeheer',
  shortlease: 'Shortlease',
  werk_derden: 'Werk derden',
  diensten_overig: 'Diensten',
};

const TABS: { key: 'open' | FactuurStatus; label: string }[] = [
  { key: 'open', label: 'Te doen' },
  { key: 'ter_controle', label: 'Ter controle' },
  { key: 'concept', label: 'Concept' },
  { key: 'aanvullen', label: 'Aanvullen' },
  { key: 'definitief', label: 'Definitief' },
  { key: 'verzonden', label: 'Verzonden' },
];

function euro(n?: number) {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)}`;
}

export default function FacturatieOverzicht() {
  const [facturen, setFacturen] = useState<UitgaandeFactuur[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'open' | FactuurStatus>('open');
  const [actief, setActief] = useState<UitgaandeFactuur | null>(null);
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const laad = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/uitgaande-facturen', { headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    setFacturen(Array.isArray(json.facturen) ? json.facturen : []);
    setLoading(false);
  }, []);

  useEffect(() => { void laad(); }, [laad]);

  async function importDocusign() {
    const env = window.prompt('DocuSign Envelope-ID van de getekende offerte:');
    if (!env) return;
    const res = await fetch('/api/uitgaande-facturen/docusign-import', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ envelopeId: env.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { await laad(); setTab('open'); alert(j.bestond ? 'Was al geïmporteerd.' : 'Geïmporteerd — staat onder “Aanvullen”.'); }
    else alert(j.error ?? 'Import mislukt');
  }

  const zichtbaar = useMemo(() => {
    if (tab === 'open') {
      return facturen.filter((f) => ['concept', 'aanvullen', 'ter_controle'].includes(f.status));
    }
    return facturen.filter((f) => f.status === tab);
  }, [facturen, tab]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Facturatie</h1>
          <p className={styles.sub}>Uitgaande facturen — auto&apos;s &amp; diensten · gekoppeld aan Twinfield</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className={styles.secondary} href="/facturatie/wagenparkbeheer">Wagenparkbeheer-config</Link>
          <button className={styles.secondary} onClick={importDocusign}>Importeer DocuSign</button>
          <button className={styles.primary} onClick={() => setNieuwOpen(true)}>+ Nieuwe factuur</button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((t) => {
          const count = t.key === 'open'
            ? facturen.filter((f) => ['concept', 'aanvullen', 'ter_controle'].includes(f.status)).length
            : facturen.filter((f) => f.status === t.key).length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}{count > 0 && <span className={styles.badge}>{count}</span>}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <p className={styles.empty}>Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p className={styles.empty}>Geen facturen in deze weergave.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th><th>Status</th><th>Klant</th><th>Nummer</th>
              <th>Datum</th><th className={styles.right}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map((f) => (
              <tr key={f.id} className={styles.row} onClick={() => setActief(f)}>
                <td>
                  <span className={styles.typeChip}>{TYPE_LABEL[f.type]}</span>
                  {f.soort === 'creditnota' && <span className={styles.credit}>credit</span>}
                </td>
                <td><span className={styles.statusChip} data-status={f.status}>{STATUS_LABEL[f.status]}</span></td>
                <td>{f.klant_naam || '—'}</td>
                <td>{f.factuurnummer || '—'}</td>
                <td>{f.factuurdatum ? new Date(f.factuurdatum).toLocaleDateString('nl-NL') : '—'}</td>
                <td className={styles.right}>{euro(f.totaal_incl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(actief || nieuwOpen) && (
        <FactuurModal
          factuur={actief}
          onClose={() => { setActief(null); setNieuwOpen(false); }}
          onSaved={async () => { await laad(); }}
        />
      )}
    </div>
  );
}
