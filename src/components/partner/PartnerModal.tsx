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

export default function PartnerModal({ auto, wie, onSluiten, onOpslaan }: Props) {
  const [datum, setDatum] = useState(auto.partner_datum ?? '');
  const [onderdelenBesteld, setOnderdelenBesteld] = useState(!!auto.partner_onderdelen_besteld);
  const [updates, setUpdates] = useState(auto.partner_updates ?? []);
  const [nieuweTekst, setNieuweTekst] = useState('');
  const [klaar, setKlaar] = useState(!!auto.wie_rijklaar_klaar);
  const [bezig, setBezig] = useState(false);

  const accessoireLijst = (auto.accessoires ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const accessoireKlaarSet = new Set(
    (auto.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  );

  async function opslaan(extra?: Partial<AfterSalesAuto>) {
    setBezig(true);
    try {
      await onOpslaan({
        ...auto,
        partner_datum: datum || undefined,
        partner_onderdelen_besteld: onderdelenBesteld,
        partner_updates: updates,
        wie_rijklaar_klaar: klaar,
        ...extra,
      });
    } finally {
      setBezig(false);
    }
  }

  async function updateToevoegen() {
    if (!nieuweTekst.trim()) return;
    const entry = { tekst: nieuweTekst.trim(), op: new Date().toISOString(), door: wie };
    const nieuweLijst = [entry, ...updates];
    setUpdates(nieuweLijst);
    setNieuweTekst('');
    await opslaan({ partner_updates: nieuweLijst });
  }

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
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
          {accessoireLijst.length > 0 && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Accessoires</h3>
              <div className={styles.accLijst}>
                {accessoireLijst.map((item) => {
                  const gedaan = accessoireKlaarSet.has(item);
                  return (
                    <span key={item} className={gedaan ? styles.accItemKlaar : styles.accItem}>
                      {gedaan ? '✓ ' : ''}{item}
                    </span>
                  );
                })}
                {auto.extra_accessoires && (
                  <span className={styles.accItem}>{auto.extra_accessoires}</span>
                )}
              </div>
            </section>
          )}

          {/* Inplanning */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Ingepland op</h3>
            <input
              type="date"
              className={styles.datumInput}
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              onBlur={() => opslaan()}
            />
          </section>

          {/* Onderdelen besteld */}
          <section className={styles.sectie}>
            <label className={styles.toggleRij}>
              <div
                className={`${styles.toggle} ${onderdelenBesteld ? styles.toggleAan : ''}`}
                onClick={async () => {
                  const n = !onderdelenBesteld;
                  setOnderdelenBesteld(n);
                  await opslaan({ partner_onderdelen_besteld: n });
                }}
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
                onChange={(e) => setNieuweTekst(e.target.value)}
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
                    <span className={styles.updateTekst}>{u.tekst}</span>
                    <span className={styles.updateMeta}>{datumFmt(u.op)} · {u.door}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Klaar melden */}
        <div className={styles.modalFooter}>
          <button
            className={`${styles.klaarKnop} ${klaar ? styles.klaarKnopAf : ''}`}
            onClick={toggleKlaar}
            disabled={bezig}
          >
            {klaar ? 'Ongedaan maken — auto nog niet klaar' : 'Auto is klaar gemeld'}
          </button>
        </div>
      </div>
    </div>
  );
}
