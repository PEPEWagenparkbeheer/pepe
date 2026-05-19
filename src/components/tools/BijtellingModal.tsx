'use client';

import { useMemo, useState } from 'react';
import styles from './BijtellingModal.module.css';

type Brandstof = 'elektrisch' | 'brandstof';
type Jaar = '2022' | '2023' | '2024' | '2025' | '2026';

const RULES = {
  elektrisch: {
    '2022': { laag: 0.16, drempel: 35000, hoog: 0.22 },
    '2023': { laag: 0.16, drempel: 35000, hoog: 0.22 },
    '2024': { laag: 0.16, drempel: 35000, hoog: 0.22 },
    '2025': { laag: 0.17, drempel: 30000, hoog: 0.22 },
    '2026': { laag: 0.18, drempel: 30000, hoog: 0.22 },
  } as const,
  brandstof: {
    '2022': { vast: 0.22 },
    '2023': { vast: 0.22 },
    '2024': { vast: 0.22 },
    '2025': { vast: 0.22 },
    '2026': { vast: 0.22 },
  } as const,
} as const;

const LB = { laag: 0.3756, hoog: 0.495 };

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(2).replace('.', ',') + '%';
}

function parseGetal(s: string): number {
  const raw = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function formatInputGetal(s: string): string {
  const raw = s.replace(/[^0-9]/g, '');
  if (!raw) return '';
  return parseInt(raw, 10).toLocaleString('nl-NL');
}

interface Props {
  open: boolean;
  onSluiten: () => void;
}

export default function BijtellingModal({ open, onSluiten }: Props) {
  const [fiscaal, setFiscaal] = useState('');
  const [jaar, setJaar] = useState<Jaar>('2026');
  const [brandstof, setBrandstof] = useState<Brandstof>('elektrisch');
  const [eigenBijdrage, setEigenBijdrage] = useState('');

  const resultaat = useMemo(() => {
    const val = parseGetal(fiscaal);
    if (val <= 0) return null;

    const eb = parseGetal(eigenBijdrage);
    let grondslag = 0;
    let effectief = 0;

    if (brandstof === 'elektrisch') {
      const { laag, drempel, hoog } = RULES.elektrisch[jaar];
      if (val <= drempel) {
        grondslag = val * laag;
      } else {
        grondslag = drempel * laag + (val - drempel) * hoog;
      }
      effectief = grondslag / val;
    } else {
      grondslag = val * RULES.brandstof[jaar].vast;
      effectief = RULES.brandstof[jaar].vast;
    }

    const brutoJaar = grondslag;
    const brutoMaand = brutoJaar / 12;
    const naAftrekMaand = Math.max(0, brutoMaand - eb);
    const nettoLaag = naAftrekMaand * LB.laag;
    const nettoHoog = naAftrekMaand * LB.hoog;

    return {
      effectief,
      brutoMaand,
      brutoJaar,
      naAftrekMaand,
      nettoLaag,
      nettoHoog,
      eigenBijdrage: eb,
      heeftEB: eb > 0,
    };
  }, [fiscaal, jaar, brandstof, eigenBijdrage]);

  function reset() {
    setFiscaal('');
    setJaar('2026');
    setBrandstof('elektrisch');
    setEigenBijdrage('');
  }

  function handleSluiten() {
    reset();
    onSluiten();
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalSub}>Tools</div>
            <div className={styles.modalTitel}>🧮 Bijtelling calculator</div>
          </div>
          <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.fg}>
            <label>Fiscale waarde (catalogusprijs)</label>
            <div className={styles.inputWrap}>
              <span className={styles.pfx}>€</span>
              <input
                className="fi"
                inputMode="numeric"
                placeholder="45.000"
                value={fiscaal}
                onChange={(e) => setFiscaal(formatInputGetal(e.target.value))}
                style={{ paddingLeft: 28 }}
              />
            </div>
          </div>

          <div className={styles.fg}>
            <label>Bouwjaar / jaar eerste toelating</label>
            <div className={styles.chipGroep}>
              {(['2022', '2023', '2024', '2025', '2026'] as Jaar[]).map((j) => (
                <button
                  key={j}
                  type="button"
                  className={`${styles.chip} ${jaar === j ? styles.chipActief : ''}`}
                  onClick={() => setJaar(j)}
                >{j}</button>
              ))}
            </div>
          </div>

          <div className={styles.fg}>
            <label>Type auto</label>
            <div className={styles.chipGroep}>
              <button
                type="button"
                className={`${styles.chip} ${brandstof === 'elektrisch' ? styles.chipActief : ''}`}
                onClick={() => setBrandstof('elektrisch')}
              >⚡ Elektrisch</button>
              <button
                type="button"
                className={`${styles.chip} ${brandstof === 'brandstof' ? styles.chipActief : ''}`}
                onClick={() => setBrandstof('brandstof')}
              >⛽ Brandstof / Hybride</button>
            </div>
          </div>

          <div className={styles.fg}>
            <label>Eigen bijdrage per maand <span className={styles.optioneel}>(optioneel)</span></label>
            <div className={styles.inputWrap}>
              <span className={styles.pfx}>€</span>
              <input
                className="fi"
                inputMode="numeric"
                placeholder="0"
                value={eigenBijdrage}
                onChange={(e) => setEigenBijdrage(formatInputGetal(e.target.value))}
                style={{ paddingLeft: 28 }}
              />
            </div>
          </div>

          {/* Resultaat */}
          {resultaat ? (
            <div className={styles.resultaat}>
              <div className={styles.pctBadge}>
                <span>Effectief bijtellingspercentage</span>
                <strong>{fmtPct(resultaat.effectief)}</strong>
              </div>

              <div className={styles.sectieLabel}>Bruto bijtelling</div>
              <div className={styles.tweeColom}>
                <div className={`${styles.box} ${styles.boxNeutral}`}>
                  <div className={styles.boxLabel}>Per maand</div>
                  <div className={styles.boxValue}>{fmtEuro(resultaat.brutoMaand)}</div>
                </div>
                <div className={`${styles.box} ${styles.boxNeutral}`}>
                  <div className={styles.boxLabel}>Per jaar</div>
                  <div className={styles.boxValue}>{fmtEuro(resultaat.brutoJaar)}</div>
                </div>
              </div>

              {resultaat.heeftEB && (
                <>
                  <div className={styles.sectieLabel}>Na aftrek eigen bijdrage</div>
                  <div className={styles.tweeColom}>
                    <div className={`${styles.box} ${styles.boxBlauw}`}>
                      <div className={styles.boxLabel}>Eigen bijdrage / mnd</div>
                      <div className={styles.boxValue}>− {fmtEuro(resultaat.eigenBijdrage)}</div>
                    </div>
                    <div className={`${styles.box} ${styles.boxBlauw}`}>
                      <div className={styles.boxLabel}>Fiscale grondslag / mnd</div>
                      <div className={styles.boxValue}>{fmtEuro(resultaat.naAftrekMaand)}</div>
                    </div>
                  </div>
                </>
              )}

              <div className={styles.sectieLabel}>Netto loonbelasting per maand{resultaat.heeftEB ? ' (na aftrek)' : ''}</div>
              <div className={styles.tweeColom}>
                <div className={`${styles.box} ${styles.boxGroen}`}>
                  <div className={styles.boxLabel}>Laag tarief (37,56%)</div>
                  <div className={styles.boxValue}>{fmtEuro(resultaat.nettoLaag)}</div>
                </div>
                <div className={`${styles.box} ${styles.boxRood}`}>
                  <div className={styles.boxLabel}>Hoog tarief (49,50%)</div>
                  <div className={styles.boxValue}>{fmtEuro(resultaat.nettoHoog)}</div>
                </div>
              </div>

              {resultaat.heeftEB && (
                <>
                  <div className={styles.sectieLabel}>Totale persoonlijke kosten per maand</div>
                  <div className={styles.tweeColom}>
                    <div className={`${styles.box} ${styles.boxGroenTotaal}`}>
                      <div className={styles.boxLabel}>Laag tarief</div>
                      <div className={styles.boxValueGroot}>{fmtEuro(resultaat.nettoLaag + resultaat.eigenBijdrage)}</div>
                    </div>
                    <div className={`${styles.box} ${styles.boxRoodTotaal}`}>
                      <div className={styles.boxLabel}>Hoog tarief</div>
                      <div className={styles.boxValueGroot}>{fmtEuro(resultaat.nettoHoog + resultaat.eigenBijdrage)}</div>
                    </div>
                  </div>
                  <p className={styles.disclaimer}>= Netto belasting + eigen bijdrage uit nettoloon</p>
                </>
              )}

              <p className={styles.disclaimer}>
                * Nettobedragen zijn schattingen op basis van loonbelastingtarieven 2026. Raadpleeg een belastingadviseur voor uw persoonlijke situatie.
              </p>
            </div>
          ) : (
            <div className={styles.placeholder}>Vul een fiscale waarde in om te berekenen</div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className="btn" onClick={reset}>Reset</button>
          <button className="btn btn-a" onClick={handleSluiten}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
