'use client';

import { useState } from 'react';
import type { LeaseAanvraag } from '@/types';
import styles from './LeasePage.module.css';

interface AkkoordResult {
  ookAfterSales: boolean;
  verwachteDatum: string;
}

interface Props {
  record: LeaseAanvraag | null;
  open: boolean;
  onBevestig: (rec: LeaseAanvraag, result: AkkoordResult) => Promise<void>;
  onSluiten: () => void;
}

function mailAkkoord(r: LeaseAanvraag) {
  const to = 'roger@pepewagenparkbeheer.nl;lorenzo@pepewagenparkbeheer.nl';
  const sub = encodeURIComponent(`Lease akkoord: ${r.klant_naam} / ${r.merk ?? ''} ${r.model ?? ''}`);
  const body = encodeURIComponent(
    `Hallo Roger en Lorenzo,\n\nEr is een leaseaanvraag akkoord gegaan. Graag verwerken in HubSpot.\n\n` +
    `Klant: ${r.klant_naam}\nBerijder: ${r.berijder || '—'}\nAuto: ${r.merk ?? ''} ${r.model ?? ''}\n` +
    `Leasemaatschappij: ${r.leasemaatschappij || '—'}\nTarief: €${r.leasetarief ?? r.leasenormbedrag ?? '—'}/mnd\n` +
    `Verdiensten LM: €${r.verdiensten_lm ?? '—'}${r.verdiensten_lm_pct ? ` (${r.verdiensten_lm_pct}%)` : ''}\n` +
    `Verdiensten Dealer: €${r.verdiensten_dealer ?? '—'}${r.verdiensten_dealer_pct ? ` (${r.verdiensten_dealer_pct}%)` : ''}\n` +
    `Inkoper: ${r.inkoper || '—'}\n\nMet vriendelijke groet,\nPEPE Flow`
  );
  window.open(`mailto:${to}?subject=${sub}&body=${body}`);
}

export default function LeaseAkkoordModal({ record, open, onBevestig, onSluiten }: Props) {
  const [ookAfterSales, setOokAfterSales] = useState(true);
  const [verwachteDatum, setVerwachteDatum] = useState('');
  const [bezig, setBezig] = useState(false);

  if (!open || !record) return null;

  const totaalVerdiensten = (record.verdiensten_lm ?? 0) + (record.verdiensten_dealer ?? 0);

  async function handleBevestig() {
    if (!record) return;
    setBezig(true);
    mailAkkoord(record);
    await onBevestig(record, { ookAfterSales, verwachteDatum });
    setBezig(false);
    onSluiten();
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modalSm}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>✅ Lease akkoord bevestigen</div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={styles.akkoordInfo}>
            <div style={{ marginBottom: 8 }}>
              <div className={styles.akkoordLabel}>Auto</div>
              <div className={styles.akkoordWaarde}>{record.merk} {record.model}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div className={styles.akkoordLabel}>Klant</div>
                <div className={styles.akkoordWaarde}>{record.klant_naam}</div>
              </div>
              {record.berijder && (
                <div>
                  <div className={styles.akkoordLabel}>Berijder</div>
                  <div className={styles.akkoordWaarde}>{record.berijder}</div>
                </div>
              )}
              <div>
                <div className={styles.akkoordLabel}>Tarief</div>
                <div className={styles.akkoordWaarde}>€{record.leasetarief ?? record.leasenormbedrag ?? '—'}/mnd</div>
              </div>
              {totaalVerdiensten > 0 && (
                <div>
                  <div className={styles.akkoordLabel}>Verdiensten</div>
                  <div className={styles.akkoordWaarde} style={{ color: 'var(--green)' }}>€{totaalVerdiensten.toLocaleString('nl-NL')}</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.fg}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Verwachte leverdatum
            </label>
            <input
              className="fi"
              type="date"
              value={verwachteDatum || record.verwachte_leverdatum || ''}
              onChange={(e) => setVerwachteDatum(e.target.value)}
            />
          </div>

          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>
              Automatisch toevoegen aan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {}}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--green)', background: 'var(--green)' }}>
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <span style={{ fontSize: 13 }}>💶 BTW / Credit lijst (verdiensten)</span>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => setOokAfterSales(!ookAfterSales)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${ookAfterSales ? 'var(--green)' : 'var(--border)'}`, background: ookAfterSales ? 'var(--green)' : '#1e2029' }}>
                {ookAfterSales && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span style={{ fontSize: 13 }}>🚗 After Sales bord (nieuw voertuig)</span>
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Er wordt een e-mail verstuurd naar Roger &amp; Lorenzo. Het record gaat naar <strong style={{ color: 'var(--text)' }}>Verkocht lease</strong>.
          </p>
        </div>

        <div className={styles.modalFooter}>
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleBevestig} disabled={bezig}>
            {bezig ? 'Verwerken...' : '✅ Bevestig akkoord →'}
          </button>
        </div>
      </div>
    </div>
  );
}
