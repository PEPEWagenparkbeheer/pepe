'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WerkDerdenRecord, WerkDerdenStatus } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import styles from './PartnerModal.module.css';

interface Props {
  record: WerkDerdenRecord;
  bijlageUrl: (path: string) => Promise<string | null>;
  onSluiten: () => void;
  onKlaarMelden: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

const STATUS_LABEL: Record<WerkDerdenStatus, string> = {
  open: '⏳ Openstaand',
  goedgekeurd: '✓ Goedgekeurd',
  klaar_gemeld: '✓ Klaar gemeld',
  gefactureerd: '✓ Gefactureerd',
  afgekeurd: '✕ Afgekeurd',
};

function statusKleur(status: WerkDerdenStatus): React.CSSProperties {
  switch (status) {
    case 'gefactureerd': return { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    case 'afgekeurd': return { background: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    case 'goedgekeurd':
    case 'klaar_gemeld': return { background: 'rgba(82,196,126,0.15)', color: 'var(--green, #52c47e)' };
    default: return { background: 'rgba(234,179,8,0.15)', color: '#b45309' };
  }
}

export default function WerkDerdenDetailModal({ record, bijlageUrl, onSluiten, onKlaarMelden }: Props) {
  const [bijlageSignedUrl, setBijlageSignedUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actief = true;
    if (record.bijlage_storage_path) {
      bijlageUrl(record.bijlage_storage_path).then((url) => { if (actief) setBijlageSignedUrl(url); });
    }
    return () => { actief = false; };
  }, [record.bijlage_storage_path, bijlageUrl]);

  const voertuig = record.kenteken ?? record.meldcode ?? '—';

  return createPortal(
    <div className={styles.overlay} onClick={onSluiten}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            <KentekenPlaat kenteken={voertuig} />
            <div className={styles.modalAuto}>
              <span className={styles.merk}>{record.merk || 'Kostenmelding'}</span>{' '}
              <span className={styles.model}>{record.model}</span>
              {record.klant && <span className={styles.klant}>{record.klant}</span>}
            </div>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Status */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Status</h3>
            <div>
              <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, ...statusKleur(record.status) }}>
                {STATUS_LABEL[record.status] ?? record.status}
              </span>
              {record.status === 'afgekeurd' && record.afkeur_reden && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{record.afkeur_reden}</div>
              )}
            </div>
          </section>

          {/* Kostenregels */}
          {record.regels.length > 0 && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Kostenregels</h3>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {record.regels.map((regel, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span>{regel.omschrijving}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{regel.bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                ))}
                {record.inkoop_bedrag != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', fontSize: 14, fontWeight: 700 }}>
                    <span>Totaal excl. BTW</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{record.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Toelichting */}
          {record.notitie && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Toelichting</h3>
              <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{record.notitie}</div>
            </section>
          )}

          {/* Bijlage */}
          {record.bijlage_storage_path && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Bijlage</h3>
              {bijlageSignedUrl
                ? <a href={bijlageSignedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'underline' }}>📎 Bijlage openen</a>
                : <span style={{ fontSize: 14, color: 'var(--muted)' }}>Laden…</span>}
            </section>
          )}
        </div>

        {/* Footer — alleen klaar melden bij goedgekeurd */}
        {record.status === 'goedgekeurd' && (
          <div className={styles.modalFooter}>
            <button
              className={styles.klaarKnop}
              disabled={bezig}
              onClick={async () => {
                setBezig(true);
                await onKlaarMelden(record.id);
                setBezig(false);
                onSluiten();
              }}
            >
              {bezig ? 'Bezig…' : '✓ Klaar melden'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
