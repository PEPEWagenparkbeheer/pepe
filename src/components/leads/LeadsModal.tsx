'use client';

import { useEffect, useState } from 'react';
import type { Lead, LeadBron, LeadStatus } from '@/types';
import styles from './LeadsPage.module.css';

const LEEG: Omit<Lead, 'id' | 'created_at'> = {
  bron: 'anders',
  klant_naam: '',
  email: '',
  telefoon: '',
  auto: '',
  advertentie_url: '',
  bericht: '',
  status: 'nieuw',
  wie: '',
  notities: '',
  vervolgactie: '',
  vervolgdatum: '',
  gearchiveerd: false,
};

const BRON_LABELS: Record<LeadBron, string> = {
  autoscout24: '🔴 AutoScout24',
  autowereld:  '🔵 Autowereld',
  marktplaats: '🟠 Marktplaats',
  email:       '✉️ E-mail',
  anders:      '📌 Anders',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  nieuw:          '🔵 Nieuw',
  opgepakt:       '🟠 Opgepakt',
  gebeld:         '🟣 Gebeld',
  interesse:      '🟢 Interesse',
  verkocht:       '✅ Verkocht',
  geen_interesse: '⬜ Geen interesse',
};

interface Props {
  lead: Lead | null;
  open: boolean;
  gebruiker: string;
  onSluiten: () => void;
  onOpslaan: (rec: Lead | Omit<Lead, 'id' | 'created_at'>) => Promise<unknown>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function LeadsModal({ lead, open, gebruiker, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<Lead, 'id' | 'created_at'>>(LEEG);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(lead ? { ...LEEG, ...lead } : { ...LEEG, wie: gebruiker });
  }, [open, lead, gebruiker]);

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  async function handleOpslaan() {
    if (!form.klant_naam.trim()) { alert('Vul de klantnaam in.'); return; }
    if (!form.auto.trim()) { alert('Vul de auto in.'); return; }
    setBezig(true);
    if (lead) {
      await onOpslaan({ ...form, id: lead.id, created_at: lead.created_at });
    } else {
      await onOpslaan(form);
    }
    setBezig(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!lead) return;
    if (!confirm('Lead verwijderen?')) return;
    await onVerwijder(lead.id);
    onSluiten();
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {lead ? `Lead: ${lead.klant_naam}` : '📞 Nieuwe lead'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>

          {/* Klant */}
          <div className={styles.sectieKop}>Klantgegevens</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Naam klant *</label>
            <input className="fi" placeholder="Voornaam Achternaam" value={form.klant_naam}
              onChange={(e) => stel('klant_naam', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>E-mailadres</label>
            <input className="fi" type="email" placeholder="naam@voorbeeld.nl" value={form.email ?? ''}
              onChange={(e) => stel('email', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Telefoonnummer</label>
            <input className="fi" type="tel" placeholder="06-12345678" value={form.telefoon ?? ''}
              onChange={(e) => stel('telefoon', e.target.value)} />
          </div>

          {/* Auto */}
          <div className={styles.sectieKop}>Auto</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Auto omschrijving *</label>
            <input className="fi" placeholder="bijv. Audi A4 2.0 TDI" value={form.auto}
              onChange={(e) => stel('auto', e.target.value)} />
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Advertentie URL</label>
            <input className="fi" type="url" placeholder="https://..." value={form.advertentie_url ?? ''}
              onChange={(e) => stel('advertentie_url', e.target.value)} />
            {form.advertentie_url && (
              <a className={styles.advertentieLink} href={form.advertentie_url} target="_blank" rel="noopener noreferrer">
                🔗 Advertentie openen ↗
              </a>
            )}
          </div>

          {/* Bron */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Bron</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(BRON_LABELS) as LeadBron[]).map((b) => (
                <button key={b} type="button"
                  className={`btn ${form.bron === b ? 'btn-a' : ''}`}
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => stel('bron', b)}
                >
                  {BRON_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className={styles.sectieKop}>Status & opvolging</div>

          <div className={styles.fg}>
            <label>Status</label>
            <select className="fi" value={form.status} onChange={(e) => stel('status', e.target.value as LeadStatus)}>
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Behandeld door (wie)</label>
            <input className="fi" placeholder="Naam collega" value={form.wie ?? ''}
              onChange={(e) => stel('wie', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Vervolgactie</label>
            <input className="fi" placeholder="bijv. Terugbellen dinsdag" value={form.vervolgactie ?? ''}
              onChange={(e) => stel('vervolgactie', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Vervolgdatum</label>
            <input className="fi" type="date" value={form.vervolgdatum ?? ''}
              onChange={(e) => stel('vervolgdatum', e.target.value)} />
          </div>

          {/* Origineel bericht (readonly als het gevuld is) */}
          {form.bericht && (
            <>
              <div className={styles.sectieKop}>Origineel bericht</div>
              <div className={`${styles.vol}`}>
                <div className={styles.berichtBox}>{form.bericht}</div>
              </div>
            </>
          )}

          {/* Notities */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Notities</label>
            <textarea className="fi" rows={3} placeholder="Interne aantekeningen..."
              value={form.notities ?? ''} onChange={(e) => stel('notities', e.target.value)} />
          </div>

        </div>

        <div className={styles.modalFooter}>
          {lead && (
            <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>
          )}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={bezig}>
            {bezig ? 'Opslaan...' : lead ? 'Opslaan' : '+ Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
