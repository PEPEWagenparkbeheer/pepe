'use client';

import { useState } from 'react';
import type { AfterSalesAuto } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import styles from './PartnerModal.module.css';

interface Props {
  auto: AfterSalesAuto;
  wie: string;
  onSluiten: () => void;
  onOpslaan: (bijgewerkt: AfterSalesAuto) => Promise<void>;
}

type Update = { tekst: string; op: string; door: string };

export default function PartnerModal({ auto, wie, onSluiten, onOpslaan }: Props) {
  const [datum, setDatum] = useState(auto.partner_datum ?? '');
  const [onderdelenBesteld, setOnderdelenBesteld] = useState(!!auto.partner_onderdelen_besteld);
  const [updates, setUpdates] = useState<Update[]>(auto.partner_updates ?? []);
  const [nieuweTekst, setNieuweTekst] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editTekst, setEditTekst] = useState('');
  const [klaar, setKlaar] = useState(!!auto.wie_rijklaar_klaar);
  const [bezig, setBezig] = useState(false);

  // Accessoires
  const [accItems, setAccItems] = useState<string[]>(
    (auto.accessoires ?? '').split(',').map(s => s.trim()).filter(Boolean)
  );
  const [accKlaarSet, setAccKlaarSet] = useState<Set<string>>(
    new Set((auto.accessoires_klaar ?? '').split(',').map(s => s.trim()).filter(Boolean))
  );
  const [nieuweAcc, setNieuweAcc] = useState('');

  function buildAuto(overrides: Partial<AfterSalesAuto> = {}): AfterSalesAuto {
    return {
      ...auto,
      partner_datum: datum || undefined,
      partner_onderdelen_besteld: onderdelenBesteld,
      partner_updates: updates,
      wie_rijklaar_klaar: klaar,
      accessoires: accItems.join(', '),
      accessoires_klaar: [...accKlaarSet].join(', '),
      ...overrides,
    };
  }

  async function opslaan(overrides: Partial<AfterSalesAuto> = {}, sluiten = false) {
    setBezig(true);
    try {
      await onOpslaan(buildAuto(overrides));
      if (sluiten) onSluiten();
    } finally { setBezig(false); }
  }

  // ── Updates ──────────────────────────────────────────────────

  async function updateToevoegen() {
    if (!nieuweTekst.trim()) return;
    const entry: Update = { tekst: nieuweTekst.trim(), op: new Date().toISOString(), door: wie };
    const nieuweLijst = [entry, ...updates];
    setUpdates(nieuweLijst);
    setNieuweTekst('');
    await opslaan({ partner_updates: nieuweLijst });
  }

  async function updateOpslaan(idx: number) {
    const nieuweLijst = updates.map((u, i) => i === idx ? { ...u, tekst: editTekst } : u);
    setUpdates(nieuweLijst);
    setEditIdx(null);
    await opslaan({ partner_updates: nieuweLijst });
  }

  // ── Accessoires ──────────────────────────────────────────────

  function accToevoegen() {
    const item = nieuweAcc.trim();
    if (!item || accItems.includes(item)) return;
    setAccItems(prev => [...prev, item]);
    setNieuweAcc('');
  }

  function toggleAccKlaar(item: string) {
    setAccKlaarSet(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  }

  // ── Klaar ────────────────────────────────────────────────────

  async function toggleKlaar() {
    const nieuwKlaar = !klaar;
    setKlaar(nieuwKlaar);
    await opslaan({ wie_rijklaar_klaar: nieuwKlaar });
  }

  function datumFmt(iso: string) {
    try {
      return new Date(iso).toLocaleString('nl-NL', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  return (
    <div className={styles.overlay} onClick={onSluiten}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            <KentekenPlaat kenteken={auto.kenteken} />
            <div className={styles.modalAuto}>
              <span className={styles.merk}>{auto.merk}</span>{' '}
              <span className={styles.model}>{auto.model}</span>
              {auto.klant && <span className={styles.klant}>{auto.klant}</span>}
            </div>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* Accessoires */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Accessoires</h3>
            <div className={styles.accLijst}>
              {accItems.map(item => (
                <span
                  key={item}
                  className={accKlaarSet.has(item) ? styles.accItemKlaar : styles.accItem}
                  onClick={() => toggleAccKlaar(item)}
                  style={{ cursor: 'pointer' }}
                >
                  {accKlaarSet.has(item) ? '✓ ' : ''}{item}
                </span>
              ))}
            </div>
            <div className={styles.accInvoer}>
              <input
                className={styles.accInput}
                placeholder="Item toevoegen..."
                value={nieuweAcc}
                onChange={e => setNieuweAcc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') accToevoegen(); }}
              />
              <button className={styles.accToevoegenKnop} onClick={accToevoegen} disabled={!nieuweAcc.trim()}>+</button>
            </div>
          </section>

          {/* Inplanning */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Ingepland op</h3>
            <input
              type="date"
              className={styles.datumInput}
              value={datum}
              onChange={e => setDatum(e.target.value)}
            />
          </section>

          {/* Onderdelen besteld */}
          <section className={styles.sectie}>
            <label className={styles.toggleRij}>
              <div
                className={`${styles.toggle} ${onderdelenBesteld ? styles.toggleAan : ''}`}
                onClick={() => setOnderdelenBesteld(n => !n)}
              >
                <div className={styles.toggleKnop} />
              </div>
              <span className={styles.toggleLabel}>Onderdelen besteld</span>
            </label>
          </section>

          {/* Updates */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Werkzaamheden / updates</h3>
            <div className={styles.updateInvoer}>
              <textarea
                className={styles.textarea}
                placeholder="Bijv. velgen zwart gespoten, remmen vervangen…"
                value={nieuweTekst}
                onChange={e => setNieuweTekst(e.target.value)}
                rows={2}
              />
              <button
                className={styles.toevoegenKnop}
                onClick={updateToevoegen}
                disabled={!nieuweTekst.trim() || bezig}
              >
                Toevoegen
              </button>
            </div>

            {updates.length > 0 && (
              <div className={styles.updateFeed}>
                {updates.map((u, i) => (
                  <div key={i} className={styles.updateEntry}>
                    {editIdx === i ? (
                      <div className={styles.editRij}>
                        <textarea
                          className={styles.textarea}
                          value={editTekst}
                          onChange={e => setEditTekst(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <div className={styles.editKnoppen}>
                          <button className={styles.editOpslaanKnop} onClick={() => updateOpslaan(i)} disabled={bezig}>Opslaan</button>
                          <button className={styles.editAnnuleerKnop} onClick={() => setEditIdx(null)}>Annuleren</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.updateTekstRij}>
                          <span className={styles.updateTekst}>{u.tekst}</span>
                          <button
                            className={styles.bewerkenKnop}
                            onClick={() => { setEditIdx(i); setEditTekst(u.tekst); }}
                            title="Bewerken"
                          >✏</button>
                        </div>
                        <span className={styles.updateMeta}>{datumFmt(u.op)} · {u.door}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            className={styles.opslaanKnop}
            onClick={() => opslaan({}, true)}
            disabled={bezig}
          >
            {bezig ? 'Opslaan...' : 'Opslaan'}
          </button>
          <button
            className={`${styles.klaarKnop} ${klaar ? styles.klaarKnopAf : ''}`}
            onClick={toggleKlaar}
            disabled={bezig}
          >
            {klaar ? 'Ongedaan maken' : 'Auto is klaar gemeld'}
          </button>
        </div>
      </div>
    </div>
  );
}
