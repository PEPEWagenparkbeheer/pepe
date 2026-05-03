'use client';

import { useEffect, useState } from 'react';
import type { BtwAutoType, BtwRecord } from '@/types';
import { INKOPERS_DEFAULT, INKOPERS_KEY } from '@/lib/constants';
import styles from './BtwPage.module.css';

const LEEG: Omit<BtwRecord, 'id' | 'created_at'> = {
  auto: '',
  type: undefined,
  klant: '',
  dealer_verkoper: '',
  ingekocht_op: '',
  bedrag: undefined,
  gelangenbest_verstuurd: false,
  geld_van_lm: false,
  geld_van_dealer: false,
  opmerkingen: '',
  inkoper: '',
  gearchiveerd: false,
};

const TYPE_KNOPPEN: { k: BtwAutoType; l: string }[] = [
  { k: 'import', l: '🌍 Import' },
  { k: 'nl', l: '🇳🇱 NL' },
  { k: 'nieuw', l: '✨ Nieuw' },
  { k: 'voorraad', l: '🏢 Voorraad' },
];

function laadInkopers(): string[] {
  if (typeof window === 'undefined') return INKOPERS_DEFAULT;
  try {
    const s = localStorage.getItem(INKOPERS_KEY);
    return s ? JSON.parse(s) : INKOPERS_DEFAULT;
  } catch { return INKOPERS_DEFAULT; }
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
  const inkopers = laadInkopers();

  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({ ...LEEG, ...record });
    } else {
      setForm({ ...LEEG });
    }
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  async function handleOpslaan() {
    if (!form.auto.trim()) { alert('Vul een auto in.'); return; }
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
          <div className={styles.modalTitel}>{record ? `${record.auto}` : 'BTW / Credit toevoegen'}</div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Auto *</label>
            <input className="fi" placeholder="bijv. BMW X5 xDrive30d" value={form.auto} onChange={(e) => stel('auto', e.target.value)} />
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPE_KNOPPEN.map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  className={`btn ${form.type === k ? 'btn-a' : ''}`}
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={() => stel('type', form.type === k ? undefined : k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fg}>
            <label>Klant</label>
            <input className="fi" placeholder="Naam klant" value={form.klant ?? ''} onChange={(e) => stel('klant', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Dealer / Verkoper</label>
            <input className="fi" placeholder="bijv. Audi Zentrum" value={form.dealer_verkoper ?? ''} onChange={(e) => stel('dealer_verkoper', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Ingekocht op</label>
            <input className="fi" type="date" value={form.ingekocht_op ?? ''} onChange={(e) => stel('ingekocht_op', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>BTW bedrag (€)</label>
            <input
              className="fi"
              type="number"
              min="0"
              step="0.01"
              placeholder="bijv. 8500"
              value={form.bedrag ?? ''}
              onChange={(e) => stel('bedrag', e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>

          <div className={styles.fg}>
            <label>Inkoper</label>
            <select className="fi" value={form.inkoper ?? ''} onChange={(e) => stel('inkoper', e.target.value)}>
              <option value="">— kies collega —</option>
              {inkopers.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Opmerkingen</label>
            <textarea className="fi" rows={2} placeholder="Interne notities..." value={form.opmerkingen ?? ''} onChange={(e) => stel('opmerkingen', e.target.value)} />
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Voortgang</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { k: 'gelangenbest_verstuurd' as const, l: 'Gelangensbestätigung verstuurd' },
                { k: 'geld_van_lm' as const, l: 'Geld ontvangen van LM' },
                { k: 'geld_van_dealer' as const, l: 'Geld ontvangen van dealer' },
              ].map(({ k, l }) => (
                <div key={k} className={styles.cbRij} onClick={() => stel(k, !form[k])} style={{ cursor: 'pointer' }}>
                  <div className={`${styles.cb} ${form[k] ? styles.on : ''}`}>
                    {form[k] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          {record && (
            <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>
          )}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}
