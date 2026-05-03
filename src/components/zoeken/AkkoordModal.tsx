'use client';

import { useState } from 'react';
import type { Zoekopdracht } from '@/types';
import styles from './AkkoordModal.module.css';

export type AutoType = 'import' | 'nl' | 'nieuw' | 'voorraad';
export type BrutoNetto = 'bruto' | 'netto';

interface Props {
  record: Zoekopdracht | null;
  open: boolean;
  onBevestig: (record: Zoekopdracht, bijzonderheden: string, autoType: AutoType, dealer: string, btwBedrag: string, brutoNetto: BrutoNetto) => void;
  onSluiten: () => void;
}

const TYPE_KNOPPEN: { k: AutoType; l: string }[] = [
  { k: 'import', l: '🌍 Import' },
  { k: 'nl', l: '🇳🇱 Nederlands' },
  { k: 'nieuw', l: '✨ Nieuw' },
  { k: 'voorraad', l: '🏢 Voorraad' },
];

function mailAkkoord(r: Zoekopdracht, bijzonderheden: string) {
  const to = 'lorenzo@pepewagenparkbeheer.nl;roger@pepewagenparkbeheer.nl';
  const onderwerp = encodeURIComponent(`Klant akkoord – ${r.klant} / ${r.auto}`);
  const inhoud = encodeURIComponent(
    `Hallo Lorenzo en Roger,\n\nKlant ${r.klant} heeft akkoord gegeven op de volgende auto:\n\n` +
    `Auto: ${r.auto}\nBudget: €${r.budget || '—'}\nBTW/Marge: ${r.btw || '—'}` +
    `\nKleuren: ${(r.kleuren ?? []).join(', ') || '—'}` +
    `\nBijzonderheden klant: ${r.details || '—'}` +
    (bijzonderheden ? `\n\nTe doen voor After Sales:\n${bijzonderheden}` : '') +
    (r.email_klant ? `\n\nE-mail klant: ${r.email_klant}` : '') +
    '\n\nMet vriendelijke groet,\nPEPE Flow'
  );
  window.open(`mailto:${to}?subject=${onderwerp}&body=${inhoud}`);
}

export default function AkkoordModal({ record, open, onBevestig, onSluiten }: Props) {
  const [autoType, setAutoType] = useState<AutoType>('import');
  const [brutoNetto, setBrutoNetto] = useState<BrutoNetto>('bruto');
  const [btwBedrag, setBtwBedrag] = useState('');
  const [lmPct, setLmPct] = useState('');
  const [lmBedrag, setLmBedrag] = useState('');
  const [dealerPct, setDealerPct] = useState('');
  const [dealerBedrag, setDealerBedrag] = useState('');
  const [dealer, setDealer] = useState('');
  const [bijzonderheden, setBijzonderheden] = useState('');

  if (!open || !record) return null;

  const isImport = autoType === 'import';
  const isCredit = autoType === 'nieuw';

  function handleBevestig() {
    if (!record) return;
    mailAkkoord(record, bijzonderheden);
    onBevestig(record, bijzonderheden, autoType, dealer, btwBedrag, brutoNetto);
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.box}>
        <h3 className={styles.titel}>✉ Klant akkoord — After Sales</h3>
        <p className={styles.sub}>Stap 1: type auto. Stap 2: bij import ook inkoop aangeven.</p>

        {/* Type auto */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Type auto</div>
          <div className={styles.typeKnoppen}>
            {TYPE_KNOPPEN.map(({ k, l }) => (
              <button
                key={k}
                className={`btn ${autoType === k ? 'btn-a' : ''}`}
                onClick={() => setAutoType(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Bruto/Netto — alleen bij import */}
        {isImport && (
          <div className={styles.sectie}>
            <div className={styles.sectieTitel}>Inkoop — BTW</div>
            <div className={styles.rij}>
              <button
                className={`btn ${brutoNetto === 'bruto' ? 'btn-a' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setBrutoNetto('bruto')}
              >
                💶 Bruto (BTW terugvorderen)
              </button>
              <button
                className={`btn ${brutoNetto === 'netto' ? 'btn-a' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setBrutoNetto('netto')}
              >
                Netto (geen BTW)
              </button>
            </div>
            {brutoNetto === 'bruto' && (
              <>
                <div className={styles.waarschuwing}>⚠️ Auto komt op de BTW/Credit lijst</div>
                <div style={{ marginTop: 10 }}>
                  <label className={styles.veldLabel}>BTW terug te vorderen (€)</label>
                  <input
                    className="fi"
                    type="number"
                    min="0"
                    placeholder="bijv. 8.500"
                    value={btwBedrag}
                    onChange={(e) => setBtwBedrag(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Credit factuur — alleen bij nieuw/nl */}
        {isCredit && (
          <div className={styles.sectie}>
            <div className={styles.sectieTitel}>Verdiensten — Credit factuur</div>
            <div className={styles.creditGrid}>
              <div>
                <label className={styles.veldLabel}>Van LM — %</label>
                <input className="fi" type="number" min="0" step="0.1" placeholder="bijv. 2" value={lmPct} onChange={(e) => setLmPct(e.target.value)} />
              </div>
              <div>
                <label className={styles.veldLabel}>Van LM — € bedrag</label>
                <input className="fi" type="number" min="0" placeholder="bijv. 500" value={lmBedrag} onChange={(e) => setLmBedrag(e.target.value)} />
              </div>
              <div>
                <label className={styles.veldLabel}>Van Dealer — %</label>
                <input className="fi" type="number" min="0" step="0.1" placeholder="bijv. 2" value={dealerPct} onChange={(e) => setDealerPct(e.target.value)} />
              </div>
              <div>
                <label className={styles.veldLabel}>Van Dealer — € bedrag</label>
                <input className="fi" type="number" min="0" placeholder="bijv. 500" value={dealerBedrag} onChange={(e) => setDealerBedrag(e.target.value)} />
              </div>
            </div>
            <div className={styles.creditInfo}>✓ Auto komt op de BTW/Credit lijst</div>
          </div>
        )}

        {/* Dealer/Verkoper */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Dealer / Verkoper (voor BTW-lijst)</div>
          <input className="fi" placeholder="bijv. Audi Zentrum Regensburg" value={dealer} onChange={(e) => setDealer(e.target.value)} />
        </div>

        {/* Bijzonderheden */}
        <textarea
          className="fi"
          rows={3}
          placeholder="Bijzonderheden voor After Sales (accessoires, schade, etc.)..."
          value={bijzonderheden}
          onChange={(e) => setBijzonderheden(e.target.value)}
          style={{ marginBottom: 8 }}
        />

        <div className={styles.knoppen}>
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={handleBevestig}>✉ Akkoord &amp; Doorsturen →</button>
        </div>
      </div>
    </div>
  );
}
