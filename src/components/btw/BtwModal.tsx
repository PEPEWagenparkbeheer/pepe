'use client';

import { useEffect, useState } from 'react';
import type { BtwAutoType, BtwRecord } from '@/types';
import styles from './BtwPage.module.css';

const LEEG: Omit<BtwRecord, 'id' | 'created_at'> = {
  kenteken: '',
  auto: '',
  berijder: '',
  type: 'btw',
  klant: '',
  dealer_verkoper: '',
  ingekocht_op: new Date().toISOString().slice(0, 10),
  bedrag: undefined,
  gelangenbest_verstuurd: false,
  geld_van_lm: false,
  geld_van_dealer: false,
  opmerkingen: '',
  inkoper: '',
  gearchiveerd: false,
};

function Cb({ aan, onClick }: { aan: boolean; onClick: () => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

interface Props {
  record: BtwRecord | null;
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: BtwRecord | Omit<BtwRecord, 'id' | 'created_at'>) => Promise<unknown>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function BtwModal({ record, open, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<BtwRecord, 'id' | 'created_at'>>(LEEG);
  const [opslaan, setOpslaan] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...LEEG, ...record } : { ...LEEG });
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  async function handleOpslaan() {
    if (!form.auto.trim()) { alert('Vul merk / model in.'); return; }
    setOpslaan(true);
    if (record) {
      await onOpslaan({ ...form, id: record.id, created_at: record.created_at });
    } else {
      await onOpslaan(form);
    }
    setOpslaan(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!record) return;
    if (!confirm('Zeker weten?')) return;
    await onVerwijder(record.id);
    onSluiten();
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {record ? `${record.kenteken || record.auto}` : '🌍 BTW/Credit toevoegen'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Rij 1: Kenteken + Merk/Model */}
          <div className={styles.fg}>
            <label>Kenteken / Meldcode</label>
            <input className="fi" placeholder="bijv. AB-123-C" value={form.kenteken ?? ''} onChange={(e) => stel('kenteken', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Merk / Model</label>
            <input className="fi" placeholder="bijv. Audi Q5" value={form.auto} onChange={(e) => stel('auto', e.target.value)} />
          </div>

          {/* Rij 2: Klant + Berijder */}
          <div className={styles.fg}>
            <label>Klant</label>
            <input className="fi" placeholder="Naam klant" value={form.klant ?? ''} onChange={(e) => stel('klant', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Berijder</label>
            <input className="fi" placeholder="Naam berijder" value={form.berijder ?? ''} onChange={(e) => stel('berijder', e.target.value)} />
          </div>

          {/* Dealer/Verkoper */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Dealer / Verkoper</label>
            <input className="fi" placeholder="bijv. Audi Zentrum" value={form.dealer_verkoper ?? ''} onChange={(e) => stel('dealer_verkoper', e.target.value)} />
          </div>

          {/* Type */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { k: 'btw' as BtwAutoType, l: '🌍 BTW terugvordering' },
                { k: 'credit' as BtwAutoType, l: '% Credit factuur' },
              ] as { k: BtwAutoType; l: string }[]).map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  className={`btn ${form.type === k ? 'btn-a' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => stel('type', k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Bedrag + Datum */}
          <div className={styles.fg}>
            <label>Ontvangen bedrag (€)</label>
            <input
              className="fi"
              type="number"
              min="0"
              step="0.01"
              placeholder="bijv. 3.500"
              value={form.bedrag ?? ''}
              onChange={(e) => stel('bedrag', e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>

          <div className={styles.fg}>
            <label>Ingekocht op</label>
            <input className="fi" type="date" value={form.ingekocht_op ?? ''} onChange={(e) => stel('ingekocht_op', e.target.value)} />
          </div>

          {/* Gelangenbest checkbox */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <div className={styles.cbRij} onClick={() => stel('gelangenbest_verstuurd', !form.gelangenbest_verstuurd)}>
              <Cb aan={!!form.gelangenbest_verstuurd} onClick={() => stel('gelangenbest_verstuurd', !form.gelangenbest_verstuurd)} />
              <span>Gelangenbestätigung verstuurd</span>
            </div>
          </div>

          {/* Opmerkingen */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Opmerkingen</label>
            <textarea className="fi" rows={3} placeholder="Eventuele bijzonderheden..." value={form.opmerkingen ?? ''} onChange={(e) => stel('opmerkingen', e.target.value)} />
          </div>
        </div>

        <div className={styles.modalFooter}>
          {record && (
            <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>
          )}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : record ? 'Opslaan' : '+ Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
