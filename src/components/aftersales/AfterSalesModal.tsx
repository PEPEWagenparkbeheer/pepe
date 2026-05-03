'use client';

import { useEffect, useState } from 'react';
import type { AfterSalesAuto, ASAutoType } from '@/types';
import { MERKEN_LIJST, INKOPERS_DEFAULT } from '@/lib/constants';
import styles from './AfterSalesPage.module.css';

const ACC_TAGS = ['Alarm', 'Alarm keuren', 'Voertuigvolg', 'Trekhaak', 'Matten'];

const PLATEN_OPTIES = ['— onbekend / NVT —', 'Besteld', 'Ontvangen', 'Gemonteerd'];

const TYPE_OPTIES: { k: ASAutoType; l: string }[] = [
  { k: 'import', l: '🌍 Import' },
  { k: 'nl', l: '🇳🇱 Nederlands' },
  { k: 'nieuw', l: '✨ Nieuw' },
  { k: 'voorraad', l: '🏢 Voorraad' },
];

const LEEG: Omit<AfterSalesAuto, 'id' | 'created_at'> = {
  kenteken: '', merk: '', model: '', klant: '', email_klant: '', type: 'nl',
  platen: '', wie_levert_af: '', wie_rijklaar: '', klaarmaker_naam: '',
  afleverdatum: '', tijdstip_levering: '', transportdatum: '',
  notitie: '', accessoires: '', extra_accessoires: '', btw_credit: false,
};

interface Props {
  record: AfterSalesAuto | null;
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: AfterSalesAuto | Omit<AfterSalesAuto, 'id' | 'created_at'>) => Promise<void>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function AfterSalesModal({ record, open, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<AfterSalesAuto, 'id' | 'created_at'>>(LEEG);
  const [opslaan, setOpslaan] = useState(false);
  const [rdwLaden, setRdwLaden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...LEEG, ...record } : { ...LEEG });
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: typeof form[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  function toggleAcc(tag: string) {
    const huidig = (form.accessoires ?? '').split(',').filter(Boolean);
    const nieuw = huidig.includes(tag) ? huidig.filter((t) => t !== tag) : [...huidig, tag];
    stel('accessoires', nieuw.join(','));
  }

  const accLijst = (form.accessoires ?? '').split(',').filter(Boolean);

  async function rdwOpzoeken() {
    const kenteken = form.kenteken.replace(/-/g, '').toUpperCase();
    if (kenteken.length < 5) { alert('Vul eerst een kenteken in.'); return; }
    setRdwLaden(true);
    try {
      const res = await fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${kenteken}`);
      const data = await res.json();
      if (!data || data.length === 0) { alert('Geen voertuig gevonden voor dit kenteken.'); return; }
      const auto = data[0];
      setForm((f) => ({
        ...f,
        merk: f.merk || (auto.merk ? auto.merk.charAt(0) + auto.merk.slice(1).toLowerCase() : f.merk),
        model: f.model || (auto.handelsbenaming ?? f.model),
        apk: f.apk || (auto.vervaldatum_apk
          ? `${auto.vervaldatum_apk.slice(6, 8)}-${auto.vervaldatum_apk.slice(4, 6)}-${auto.vervaldatum_apk.slice(0, 4)}`
          : f.apk),
      }));
    } catch {
      alert('RDW ophalen mislukt. Controleer je internetverbinding.');
    } finally {
      setRdwLaden(false);
    }
  }

  async function handleOpslaan() {
    if (!form.kenteken) { alert('Vul een kenteken in.'); return; }
    setOpslaan(true);
    if (record) await onOpslaan({ ...form, id: record.id, created_at: record.created_at });
    else await onOpslaan(form);
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

  const isImport = form.type === 'import';

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {record ? `${record.kenteken} — ${record.merk ?? ''} ${record.model ?? ''}`.trim() : 'Auto toevoegen — After Sales'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>

          {/* Kenteken + RDW */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Kenteken / Meldcode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="fi"
                placeholder="bijv. AB-123-C of laatste 4 chassis"
                value={form.kenteken}
                onChange={(e) => stel('kenteken', e.target.value.toUpperCase())}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#60a5fa', borderColor: 'rgba(96,165,250,.3)' }}
                onClick={rdwOpzoeken}
                disabled={rdwLaden}
              >
                {rdwLaden ? '...' : '🔵 RDW'}
              </button>
            </div>
          </div>

          {/* Type auto */}
          <div className={styles.fg}>
            <label>Type auto</label>
            <select className="fi" value={form.type ?? 'nl'} onChange={(e) => stel('type', e.target.value as ASAutoType)}>
              {TYPE_OPTIES.map(({ k, l }) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          {/* Merk */}
          <div className={styles.fg}>
            <label>Merk</label>
            <select className="fi" value={form.merk ?? ''} onChange={(e) => stel('merk', e.target.value)}>
              <option value="">— kies merk —</option>
              {MERKEN_LIJST.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className={styles.fg}>
            <label>Model</label>
            <input className="fi" placeholder="bijv. Q5, A6, EV3..." value={form.model ?? ''} onChange={(e) => stel('model', e.target.value)} />
          </div>

          {/* Klant naam */}
          <div className={styles.fg}>
            <label>Klant naam</label>
            <input className="fi" placeholder="Voornaam Achternaam" value={form.klant ?? ''} onChange={(e) => stel('klant', e.target.value)} />
          </div>

          {/* E-mail klant */}
          <div className={styles.fg}>
            <label>E-mail klant</label>
            <input className="fi" type="email" placeholder="klant@email.nl" value={form.email_klant ?? ''} onChange={(e) => stel('email_klant', e.target.value)} />
          </div>

          {/* Kentekenplaten */}
          <div className={styles.fg}>
            <label>Kentekenplaten</label>
            <select className="fi" value={form.platen ?? ''} onChange={(e) => stel('platen', e.target.value)}>
              {PLATEN_OPTIES.map((o) => <option key={o} value={o === PLATEN_OPTIES[0] ? '' : o}>{o}</option>)}
            </select>
          </div>

          {/* Wie levert af */}
          <div className={styles.fg}>
            <label>Wie levert af</label>
            <select className="fi" value={form.wie_levert_af ?? ''} onChange={(e) => stel('wie_levert_af', e.target.value)}>
              <option value="">— kies —</option>
              {INKOPERS_DEFAULT.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Wie maakt klaar */}
          <div className={styles.fg}>
            <label>Wie maakt klaar</label>
            <select className="fi" value={form.wie_rijklaar ?? ''} onChange={(e) => stel('wie_rijklaar', e.target.value)}>
              <option value="">— kies —</option>
              {INKOPERS_DEFAULT.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__extern__">Extern / Anders</option>
            </select>
          </div>

          {/* Klaarmaker naam (vrij invullen) */}
          <div className={styles.fg}>
            <label>Klaarmaker naam (vrij invullen)</label>
            <input className="fi" placeholder="Naam garage/persoon" value={form.klaarmaker_naam ?? ''} onChange={(e) => stel('klaarmaker_naam', e.target.value)} />
          </div>

          {/* Geplande leverdatum */}
          <div className={styles.fg}>
            <label>Geplande leverdatum</label>
            <input className="fi" type="date" value={form.afleverdatum ?? ''} onChange={(e) => stel('afleverdatum', e.target.value)} />
          </div>

          {/* Tijdstip levering */}
          <div className={styles.fg}>
            <label>Tijdstip levering</label>
            <input className="fi" type="time" value={form.tijdstip_levering ?? ''} onChange={(e) => stel('tijdstip_levering', e.target.value)} />
          </div>

          {/* Transportdatum — alleen bij import */}
          {isImport && (
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Transportdatum</label>
              <input className="fi" type="date" value={form.transportdatum ?? ''} onChange={(e) => stel('transportdatum', e.target.value)} />
            </div>
          )}

          {/* Accessoires tags */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Accessoires</label>
            <div className={styles.typeGrid}>
              {ACC_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.typeBtn} ${accLijst.includes(tag) ? styles.actief : ''}`}
                  onClick={() => toggleAcc(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Extra accessoires / opmerkingen */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Extra accessoires / opmerkingen</label>
            <input className="fi" placeholder="bijv. velgen 18 inch, dashcam..." value={form.extra_accessoires ?? ''} onChange={(e) => stel('extra_accessoires', e.target.value)} />
          </div>

          {/* Interne notities */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Interne notities</label>
            <textarea className="fi" rows={3} placeholder="bijv. staat bij VDU, wacht op onderdeel..." value={form.notitie ?? ''} onChange={(e) => stel('notitie', e.target.value)} />
          </div>

          {/* BTW / Credit overzicht */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>BTW / Credit overzicht</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'normal', fontSize: 13, textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={!!form.btw_credit}
                onChange={(e) => stel('btw_credit', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              Zet in BTW/Credit overzicht
            </label>
          </div>

        </div>

        <div className={styles.modalFooter}>
          {record && <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>{opslaan ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
