'use client';

import { useEffect, useState } from 'react';
import {
  BRANDSTOF,
  INKOPERS_DEFAULT,
  INKOPERS_KEY,
  KLEUR_MAP,
  KLEUREN,
  MERKEN_LIJST,
  OPTIES,
  PROG,
} from '@/lib/constants';
import type { Zoekopdracht } from '@/types';
import WhatsAppModal from './WhatsAppModal';
import styles from './ZoekenModal.module.css';

const LEEG: Omit<Zoekopdracht, 'id'> = {
  klant: '', auto: '', details: '', km: '', jaar: '', budget: '', btw: '',
  wiezoekt: '', email_klant: '', opmerkingen: '', as_email: '', terugkoppeling_txt: '',
  kleuren: [], opties: {}, brandstof: [],
  uitgewerkt: false, terugkoppeling: false, dealer: false,
  inkopen: false, contract: false, akkoord: false, uitgesteld: false, prio: false,
};

function laadInkopers(): string[] {
  if (typeof window === 'undefined') return INKOPERS_DEFAULT;
  try {
    const s = localStorage.getItem(INKOPERS_KEY);
    return s ? JSON.parse(s) : INKOPERS_DEFAULT;
  } catch { return INKOPERS_DEFAULT; }
}

interface Props {
  record: Zoekopdracht | null; // null = nieuw
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: Zoekopdracht | Omit<Zoekopdracht, 'id'>) => Promise<void>;
  onVerwijder: (id: number) => Promise<void>;
}

export default function ZoekenModal({ record, open, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<Zoekopdracht, 'id'>>(LEEG);
  const [merk, setMerk] = useState('');
  const [model, setModel] = useState('');
  const [opslaan, setOpslaan] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const inkopers = laadInkopers();

  useEffect(() => {
    if (!open) return;
    if (record) {
      const autoOnderdelen = record.auto?.split(' ') ?? [];
      const gevondenMerk = MERKEN_LIJST.find((m) =>
        record.auto?.toLowerCase().startsWith(m.toLowerCase())
      ) ?? '';
      const modelDeel = gevondenMerk
        ? record.auto?.slice(gevondenMerk.length).trim()
        : autoOnderdelen.slice(1).join(' ');
      setMerk(gevondenMerk);
      setModel(modelDeel ?? '');
      setForm({ ...LEEG, ...record });
    } else {
      setMerk('');
      setModel('');
      setForm({ ...LEEG });
    }
  }, [open, record]);

  function stelIn<K extends keyof Omit<Zoekopdracht, 'id'>>(veld: K, waarde: Omit<Zoekopdracht, 'id'>[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  function toggleKleur(k: string) {
    const huidige = form.kleuren ?? [];
    stelIn('kleuren', huidige.includes(k) ? huidige.filter((x) => x !== k) : [...huidige, k]);
  }

  function toggleOptie(k: string) {
    const huidige = form.opties ?? {};
    stelIn('opties', { ...huidige, [k]: !huidige[k] });
  }

  function toggleBrandstof(k: string) {
    const huidige = form.brandstof ?? [];
    stelIn('brandstof', huidige.includes(k) ? huidige.filter((x) => x !== k) : [...huidige, k]);
  }

  function toggleProg(k: string) {
    setForm((f) => ({ ...f, [k]: !f[k as keyof typeof f] }));
  }

  async function handleOpslaan() {
    const autoStr = `${merk} ${model}`.trim();
    if (!form.klant || !autoStr) {
      alert('Vul klant, merk en model in.');
      return;
    }
    setOpslaan(true);
    const rec = { ...form, auto: autoStr };
    if (record) {
      await onOpslaan({ ...rec, id: record.id });
    } else {
      await onOpslaan(rec);
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
    <>
      <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.titel}>
              {record ? `${record.klant} — ${record.auto}` : 'Nieuwe zoekopdracht'}
            </div>
            <div className={styles.headerRechts}>
              <button className={styles.aiKnop} onClick={() => setWhatsAppOpen(true)}>
                ✦ WhatsApp inlezen
              </button>
              <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
            </div>
          </div>

          {/* Formulier */}
          <div className={styles.body}>
            <div className={styles.fg}>
              <label>Klant naam *</label>
              <input className="fi" placeholder="Voornaam Achternaam" value={form.klant} onChange={(e) => stelIn('klant', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Wie zoekt</label>
              <select className="fi" value={form.wiezoekt ?? ''} onChange={(e) => stelIn('wiezoekt', e.target.value)}>
                <option value="">— kies collega —</option>
                {inkopers.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className={styles.fg}>
              <label>Merk *</label>
              <select className="fi" value={merk} onChange={(e) => setMerk(e.target.value)}>
                <option value="">— kies merk —</option>
                {MERKEN_LIJST.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className={styles.fg}>
              <label>Model *</label>
              <input className="fi" placeholder="bijv. Q5, 3 serie, EV3..." value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Bijzonderheden / wensen</label>
              <textarea className="fi" rows={2} placeholder="uitvoering, opties, overige wensen..." value={form.details ?? ''} onChange={(e) => stelIn('details', e.target.value)} />
            </div>

            {/* Kleuren */}
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Gewenste kleuren</label>
              <div className={styles.kleurenGrid}>
                {KLEUREN.map((k) => (
                  <div
                    key={k}
                    className={`${styles.kleurItem} ${(form.kleuren ?? []).includes(k) ? styles.kleurActief : ''}`}
                    onClick={() => toggleKleur(k)}
                  >
                    <div className={styles.kleurSwatch} style={{ background: KLEUR_MAP[k] }} />
                    <span>{k}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Opties */}
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Opties</label>
              <div className={styles.pillGrid}>
                {OPTIES.map(({ k, l }) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.pill} ${form.opties?.[k] ? styles.pillActief : ''}`}
                    onClick={() => toggleOptie(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fg}>
              <label>Kilometerstand (max)</label>
              <input className="fi" placeholder="bijv. 80.000" value={form.km ?? ''} onChange={(e) => stelIn('km', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Bouwjaar</label>
              <input className="fi" placeholder="bijv. 2021–2024" value={form.jaar ?? ''} onChange={(e) => stelIn('jaar', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Budget (€)</label>
              <input className="fi" placeholder="bijv. 35.000" value={form.budget ?? ''} onChange={(e) => stelIn('budget', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>BTW / Marge</label>
              <select className="fi" value={form.btw ?? ''} onChange={(e) => stelIn('btw', e.target.value)}>
                <option value="">— onbekend —</option>
                <option value="BTW">BTW</option>
                <option value="Marge">Marge</option>
              </select>
            </div>

            {/* Brandstof */}
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Brandstof</label>
              <div className={styles.pillGrid}>
                {BRANDSTOF.map(({ k, l }) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.pill} ${(form.brandstof ?? []).includes(k) ? styles.pillActief : ''}`}
                    onClick={() => toggleBrandstof(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fg}>
              <label>E-mail klant</label>
              <input className="fi" type="email" placeholder="klant@email.nl" value={form.email_klant ?? ''} onChange={(e) => stelIn('email_klant', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Opmerkingen</label>
              <input className="fi" placeholder="interne notities..." value={form.opmerkingen ?? ''} onChange={(e) => stelIn('opmerkingen', e.target.value)} />
            </div>
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Terugkoppeling notitie</label>
              <textarea className="fi" rows={2} placeholder="Notitie terugkoppeling aan klant..." value={form.terugkoppeling_txt ?? ''} onChange={(e) => stelIn('terugkoppeling_txt', e.target.value)} />
            </div>

            {/* Voortgang */}
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Voortgang</label>
              <div className={styles.progGrid}>
                {PROG.map(({ k, l }) => (
                  <div
                    key={k}
                    className={`${styles.progItem} ${form[k as keyof typeof form] ? styles.progActief : ''}`}
                    onClick={() => toggleProg(k)}
                  >
                    <div className={`${styles.progDot} ${form[k as keyof typeof form] ? styles.progDotActief : ''}`} />
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            {record && (
              <button className={styles.verwijderKnop} onClick={handleVerwijder}>
                🗑 Verwijder
              </button>
            )}
            <button className="btn" onClick={onSluiten}>Annuleer</button>
            <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>

      <WhatsAppModal
        open={whatsAppOpen}
        onSluiten={() => setWhatsAppOpen(false)}
        onParse={(resultaat) => {
          if (resultaat.klant) stelIn('klant', resultaat.klant);
          if (resultaat.auto) {
            const gevondenMerk = MERKEN_LIJST.find((m) =>
              resultaat.auto?.toLowerCase().startsWith(m.toLowerCase())
            ) ?? '';
            setMerk(gevondenMerk);
            setModel(gevondenMerk ? (resultaat.auto.slice(gevondenMerk.length).trim()) : resultaat.auto);
          }
          if (resultaat.details) stelIn('details', resultaat.details);
          if (resultaat.km) stelIn('km', resultaat.km);
          if (resultaat.jaar) stelIn('jaar', resultaat.jaar);
          if (resultaat.budget) stelIn('budget', resultaat.budget);
          if (resultaat.btw) stelIn('btw', resultaat.btw);
          if (resultaat.kleuren?.length) stelIn('kleuren', resultaat.kleuren);
          if (resultaat.opties) stelIn('opties', resultaat.opties);
        }}
      />
    </>
  );
}
