'use client';

import { useEffect, useState } from 'react';
import type { LeaseKlant } from '@/types';
import styles from './LeasePage.module.css';

const LOOPTIJD_OPTIES = ['12', '24', '36', '48', '60'];
const KM_OPTIES = ['10000', '15000', '20000', '25000', '30000', '35000', '40000', '50000'];
const BANDEN_OPTIES = ['Zomer', 'Winter', 'All season'];
const ER_OPTIES = ['Laag', 'Hoog'];

const LEEG: Omit<LeaseKlant, 'id' | 'created_at'> = {
  naam: '',
  looptijd: '36',
  jaarkilometrage: '20000',
  banden: 'All season',
  eigen_risico: 'Laag',
  vervangend_vervoer: false,
  brandstofvoorschot: false,
  notities: '',
};

function Cb({ aan, onClick }: { aan: boolean; onClick: () => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={onClick}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

interface Props {
  record: LeaseKlant | null;
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: LeaseKlant | Omit<LeaseKlant, 'id' | 'created_at'>) => Promise<unknown>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function LeaseKlantModal({ record, open, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<LeaseKlant, 'id' | 'created_at'>>(LEEG);
  const [opslaan, setOpslaan] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...LEEG, ...record } : { ...LEEG });
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  async function handleOpslaan() {
    if (!form.naam.trim()) { alert('Vul een klantnaam in.'); return; }
    setOpslaan(true);
    if (record) await onOpslaan({ ...form, id: record.id, created_at: record.created_at });
    else await onOpslaan(form);
    setOpslaan(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!record) return;
    if (!confirm('Klant verwijderen? Bestaande aanvragen blijven behouden.')) return;
    await onVerwijder(record.id);
    onSluiten();
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modalSm}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>{record ? record.naam : 'Klant / Norm toevoegen'}</div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Klantnaam *</label>
            <input className="fi" placeholder="Bijv. Taxi Achmed BV" value={form.naam} onChange={(e) => stel('naam', e.target.value)} />
          </div>

          <div className={styles.sectieKop}>Standaard leasenorm</div>

          <div className={styles.fg}>
            <label>Looptijd (mnd)</label>
            <select className="fi" value={form.looptijd ?? ''} onChange={(e) => stel('looptijd', e.target.value)}>
              <option value="">— kies —</option>
              {LOOPTIJD_OPTIES.map((o) => <option key={o} value={o}>{o} maanden</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Jaarkilometrage</label>
            <select className="fi" value={form.jaarkilometrage ?? ''} onChange={(e) => stel('jaarkilometrage', e.target.value)}>
              <option value="">— kies —</option>
              {KM_OPTIES.map((o) => <option key={o} value={o}>{parseInt(o).toLocaleString('nl-NL')} km</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Banden</label>
            <select className="fi" value={form.banden ?? ''} onChange={(e) => stel('banden', e.target.value)}>
              <option value="">— kies —</option>
              {BANDEN_OPTIES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Eigen risico</label>
            <select className="fi" value={form.eigen_risico ?? ''} onChange={(e) => stel('eigen_risico', e.target.value)}>
              <option value="">— kies —</option>
              {ER_OPTIES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Vervangend vervoer</label>
            <div className={styles.cbRij} onClick={() => stel('vervangend_vervoer', !form.vervangend_vervoer)}>
              <Cb aan={!!form.vervangend_vervoer} onClick={() => stel('vervangend_vervoer', !form.vervangend_vervoer)} />
              <span>Standaard VV inbegrepen</span>
            </div>
          </div>

          <div className={styles.fg}>
            <label>Brandstofvoorschot</label>
            <div className={styles.cbRij} onClick={() => stel('brandstofvoorschot', !form.brandstofvoorschot)}>
              <Cb aan={!!form.brandstofvoorschot} onClick={() => stel('brandstofvoorschot', !form.brandstofvoorschot)} />
              <span>Standaard BS inbegrepen</span>
            </div>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Notities</label>
            <textarea className="fi" rows={2} placeholder="Interne notities over deze klant..." value={form.notities ?? ''} onChange={(e) => stel('notities', e.target.value)} />
          </div>
        </div>

        <div className={styles.modalFooter}>
          {record && <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}
