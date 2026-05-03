'use client';

import { useEffect, useState } from 'react';
import type { LeaseAanvraag, LeaseKlant } from '@/types';
import { INKOPERS_DEFAULT, INKOPERS_KEY, MERKEN_LIJST } from '@/lib/constants';
import styles from './LeasePage.module.css';

const LOOPTIJD_OPTIES = ['12', '24', '36', '48', '60'];
const KM_OPTIES = ['10000', '15000', '20000', '25000', '30000', '35000', '40000', '50000'];
const BANDEN_OPTIES = ['Zomer', 'Winter', 'All season'];
const ER_OPTIES = ['Laag', 'Hoog'];

const LEEG: Omit<LeaseAanvraag, 'id' | 'created_at'> = {
  klant_id: '',
  klant_naam: '',
  berijder: '',
  merk: '',
  model: '',
  leasemaatschappij: '',
  leasenormbedrag: undefined,
  leasetarief: undefined,
  verdiensten_lm: undefined,
  verdiensten_lm_pct: undefined,
  verdiensten_dealer: undefined,
  verdiensten_dealer_pct: undefined,
  looptijd: '36',
  jaarkilometrage: '20000',
  banden: 'All season',
  eigen_risico: 'Laag',
  vervangend_vervoer: false,
  brandstofvoorschot: false,
  inkoper: '',
  offerte_verstuurd: false,
  verwachte_leverdatum: '',
  notities: '',
  akkoord: false,
  verkocht: false,
  in_btw_lijst: false,
};

function laadInkopers(): string[] {
  if (typeof window === 'undefined') return INKOPERS_DEFAULT;
  try {
    const s = localStorage.getItem(INKOPERS_KEY);
    return s ? JSON.parse(s) : INKOPERS_DEFAULT;
  } catch { return INKOPERS_DEFAULT; }
}

function Cb({ aan, onClick }: { aan: boolean; onClick: () => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

function mailNieuweAanvraag(r: LeaseAanvraag) {
  const to = 'diego@pepewagenparkbeheer.nl;joep@pepewagenparkbeheer.nl';
  const sub = encodeURIComponent(`Nieuwe leaseaanvraag – ${r.klant_naam} / ${r.merk ?? ''} ${r.model ?? ''}`);
  const body = encodeURIComponent(
    `Hallo,\n\nEr is een nieuwe leaseaanvraag binnengekomen:\n\n` +
    `Klant: ${r.klant_naam}\nBerijder: ${r.berijder || '—'}\nAuto: ${r.merk ?? ''} ${r.model ?? ''}\n` +
    `Leasemaatschappij: ${r.leasemaatschappij || '—'}\nNormbedrag: €${r.leasenormbedrag ?? '—'}/mnd\n` +
    `Looptijd: ${r.looptijd ?? '—'} mnd · ${r.jaarkilometrage ? parseInt(r.jaarkilometrage).toLocaleString('nl-NL') : '—'} km\n` +
    `Verdiensten LM: €${r.verdiensten_lm ?? '—'}${r.verdiensten_lm_pct ? ` (${r.verdiensten_lm_pct}%)` : ''}\n` +
    `Verdiensten Dealer: €${r.verdiensten_dealer ?? '—'}${r.verdiensten_dealer_pct ? ` (${r.verdiensten_dealer_pct}%)` : ''}\n` +
    `Inkoper: ${r.inkoper || '—'}\n\nMet vriendelijke groet,\nPEPE Flow`
  );
  window.open(`mailto:${to}?subject=${sub}&body=${body}`);
}

interface Props {
  record: LeaseAanvraag | null;
  klanten: LeaseKlant[];
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: LeaseAanvraag | Omit<LeaseAanvraag, 'id' | 'created_at'>) => Promise<unknown>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function LeaseModal({ record, klanten, open, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<LeaseAanvraag, 'id' | 'created_at'>>(LEEG);
  const [opslaan, setOpslaan] = useState(false);
  const inkopers = laadInkopers();

  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...LEEG, ...record } : { ...LEEG });
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  function onKlantKiezen(klantId: string) {
    const klant = klanten.find((k) => String(k.id) === String(klantId));
    if (!klant) { stel('klant_id', ''); stel('klant_naam', ''); return; }
    setForm((f) => ({
      ...f,
      klant_id: klant.id,
      klant_naam: klant.naam,
      looptijd: klant.looptijd ?? f.looptijd,
      jaarkilometrage: klant.jaarkilometrage ?? f.jaarkilometrage,
      banden: klant.banden ?? f.banden,
      eigen_risico: klant.eigen_risico ?? f.eigen_risico,
      vervangend_vervoer: klant.vervangend_vervoer ?? f.vervangend_vervoer,
      brandstofvoorschot: klant.brandstofvoorschot ?? f.brandstofvoorschot,
    }));
  }

  async function handleOpslaan() {
    if (!form.klant_naam.trim()) { alert('Vul een klantnaam in.'); return; }
    setOpslaan(true);
    let saved: LeaseAanvraag | Omit<LeaseAanvraag, 'id' | 'created_at'>;
    if (record) {
      saved = { ...form, id: record.id, created_at: record.created_at };
    } else {
      saved = form;
      // Mail bij nieuwe aanvraag
      const tijdelijk = { ...form, id: '', created_at: '' } as LeaseAanvraag;
      mailNieuweAanvraag(tijdelijk);
    }
    await onOpslaan(saved);
    setOpslaan(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!record) return;
    if (!confirm('Zeker verwijderen?')) return;
    await onVerwijder(record.id);
    onSluiten();
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {record ? `${record.klant_naam} — ${record.merk ?? ''} ${record.model ?? ''}`.trim() : 'Nieuwe leaseaanvraag'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Klant dropdown */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Klant {klanten.length > 0 ? '(kies uit normen)' : ''}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {klanten.length > 0 && (
                <select
                  className="fi"
                  value={String(form.klant_id ?? '')}
                  onChange={(e) => onKlantKiezen(e.target.value)}
                  style={{ flex: '0 0 auto', width: 200 }}
                >
                  <option value="">— kies klant —</option>
                  {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
                </select>
              )}
              <input
                className="fi"
                placeholder="Klantnaam *"
                value={form.klant_naam}
                onChange={(e) => stel('klant_naam', e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className={styles.fg}>
            <label>Berijder</label>
            <input className="fi" placeholder="Naam berijder" value={form.berijder ?? ''} onChange={(e) => stel('berijder', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Inkoper</label>
            <select className="fi" value={form.inkoper ?? ''} onChange={(e) => stel('inkoper', e.target.value)}>
              <option value="">— kies —</option>
              {inkopers.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Merk</label>
            <select className="fi" value={form.merk ?? ''} onChange={(e) => stel('merk', e.target.value)}>
              <option value="">— kies merk —</option>
              {MERKEN_LIJST.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Model</label>
            <input className="fi" placeholder="bijv. Tiguan, A3..." value={form.model ?? ''} onChange={(e) => stel('model', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Leasemaatschappij</label>
            <input className="fi" placeholder="bijv. Alphabet, LeasePlan..." value={form.leasemaatschappij ?? ''} onChange={(e) => stel('leasemaatschappij', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Normbedrag (€/mnd)</label>
            <input className="fi" type="number" min="0" placeholder="bijv. 650" value={form.leasenormbedrag ?? ''} onChange={(e) => stel('leasenormbedrag', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          <div className={styles.fg}>
            <label>Scherpste tarief (€/mnd)</label>
            <input className="fi" type="number" min="0" placeholder="bijv. 589" value={form.leasetarief ?? ''} onChange={(e) => stel('leasetarief', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          <div className={styles.fg}>
            <label>Verwachte leverdatum</label>
            <input className="fi" type="date" value={form.verwachte_leverdatum ?? ''} onChange={(e) => stel('verwachte_leverdatum', e.target.value)} />
          </div>

          {/* Verdiensten */}
          <div className={styles.sectieKop}>Verdiensten</div>

          <div className={styles.fg}>
            <label>Van LM — bedrag (€)</label>
            <input className="fi" type="number" min="0" placeholder="bijv. 500" value={form.verdiensten_lm ?? ''} onChange={(e) => stel('verdiensten_lm', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          <div className={styles.fg}>
            <label>Van LM — %</label>
            <input className="fi" type="number" min="0" step="0.1" placeholder="bijv. 2" value={form.verdiensten_lm_pct ?? ''} onChange={(e) => stel('verdiensten_lm_pct', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          <div className={styles.fg}>
            <label>Van Dealer — bedrag (€)</label>
            <input className="fi" type="number" min="0" placeholder="bijv. 750" value={form.verdiensten_dealer ?? ''} onChange={(e) => stel('verdiensten_dealer', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          <div className={styles.fg}>
            <label>Van Dealer — %</label>
            <input className="fi" type="number" min="0" step="0.1" placeholder="bijv. 3" value={form.verdiensten_dealer_pct ?? ''} onChange={(e) => stel('verdiensten_dealer_pct', e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>

          {/* Leasenorm */}
          <div className={styles.sectieKop}>Leasenorm</div>

          <div className={styles.fg}>
            <label>Looptijd</label>
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
              <span>Inbegrepen</span>
            </div>
          </div>

          <div className={styles.fg}>
            <label>Brandstofvoorschot</label>
            <div className={styles.cbRij} onClick={() => stel('brandstofvoorschot', !form.brandstofvoorschot)}>
              <Cb aan={!!form.brandstofvoorschot} onClick={() => stel('brandstofvoorschot', !form.brandstofvoorschot)} />
              <span>Inbegrepen</span>
            </div>
          </div>

          {/* Status */}
          <div className={styles.sectieKop}>Status</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <div className={styles.cbRij} onClick={() => stel('offerte_verstuurd', !form.offerte_verstuurd)}>
              <Cb aan={!!form.offerte_verstuurd} onClick={() => stel('offerte_verstuurd', !form.offerte_verstuurd)} />
              <span>Offerte verstuurd naar klant</span>
            </div>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Notities</label>
            <textarea className="fi" rows={2} placeholder="Interne opmerkingen..." value={form.notities ?? ''} onChange={(e) => stel('notities', e.target.value)} />
          </div>
        </div>

        <div className={styles.modalFooter}>
          {record && <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : record ? 'Opslaan' : '✉ Opslaan & Mailen'}
          </button>
        </div>
      </div>
    </div>
  );
}
