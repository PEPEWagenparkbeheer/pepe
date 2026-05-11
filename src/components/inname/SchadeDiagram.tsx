'use client';

import { useRef, useState } from 'react';
import styles from './InnamePage.module.css';

export interface SchadePunt {
  x: number; // 0-1 relatief
  y: number;
  type: string;
  symbol: string;
}

const SCHADE_TYPES = [
  { type: 'putje',       symbol: 'X',  label: 'Putje' },
  { type: 'diepe_kras',  symbol: '=',  label: 'Diepe kras' },
  { type: 'lichte_kras', symbol: '--', label: 'Lichte kras' },
  { type: 'deuk',        symbol: 'O',  label: 'Deuk' },
  { type: 'roest',       symbol: 'R',  label: 'Roest' },
  { type: 'verkleuring', symbol: 'V',  label: 'Verkleuring' },
];

interface Props {
  punten: SchadePunt[];
  onChange: (punten: SchadePunt[]) => void;
}

export default function SchadeDiagram({ punten, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [popup, setPopup] = useState<{ x: number; y: number; svgX: number; svgY: number } | null>(null);

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setPopup({ x: e.clientX, y: e.clientY, svgX: relX, svgY: relY });
  }

  function plaatsPunt(type: string, symbol: string) {
    if (!popup) return;
    onChange([...punten, { x: popup.svgX, y: popup.svgY, type, symbol }]);
    setPopup(null);
  }

  function verwijderPunt(idx: number) {
    onChange(punten.filter((_, i) => i !== idx));
  }

  return (
    <div className={styles.diagramWrap}>
      <svg
        ref={svgRef}
        viewBox="0 0 180 380"
        className={styles.carSvg}
        onClick={handleSvgClick}
      >
        {/* ── Auto bovenaanzicht ── */}
        {/* Carrosserie buiten */}
        <path
          d="M 55,18 Q 90,10 125,18 L 155,55 L 162,120 L 162,265 L 150,315 Q 90,330 30,315 L 18,265 L 18,120 L 25,55 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5"
        />
        {/* Motorkap lijn */}
        <line x1="28" y1="95" x2="152" y2="95" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
        {/* Voorruit */}
        <path d="M 38,95 L 44,128 L 136,128 L 142,95" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {/* Achterruit */}
        <path d="M 38,250 L 44,218 L 136,218 L 142,250" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {/* Kofferbak lijn */}
        <line x1="30" y1="250" x2="150" y2="250" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
        {/* Dak */}
        <rect x="44" y="128" width="92" height="90" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {/* Wielen */}
        <rect x="11" y="62" width="16" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="153" y="62" width="16" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="11" y="270" width="16" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="153" y="270" width="16" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Voorbumper */}
        <path d="M 55,18 Q 90,12 125,18" fill="none" stroke="currentColor" strokeWidth="3" />
        {/* Achterbumper */}
        <path d="M 30,315 Q 90,328 150,315" fill="none" stroke="currentColor" strokeWidth="3" />

        {/* Schade markers */}
        {punten.map((p, i) => (
          <g key={i} onClick={(e) => { e.stopPropagation(); verwijderPunt(i); }} style={{ cursor: 'pointer' }}>
            <circle cx={p.x * 180} cy={p.y * 380} r="10" fill="rgba(220,38,38,0.85)" />
            <text
              x={p.x * 180} y={p.y * 380 + 4}
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="white"
            >
              {p.symbol}
            </text>
          </g>
        ))}
      </svg>

      <p className={styles.diagramHint}>
        Tik op de auto om schade toe te voegen · Tik op een marker om te verwijderen
      </p>

      {/* Legenda */}
      <div className={styles.legenda}>
        {SCHADE_TYPES.map(t => (
          <span key={t.type} className={styles.legendaItem}>
            <span className={styles.legendaSymbol}>{t.symbol}</span> {t.label}
          </span>
        ))}
      </div>

      {/* Popup type kiezen */}
      {popup && (
        <>
          <div className={styles.popupOverlay} onClick={() => setPopup(null)} />
          <div className={styles.schadePopup}>
            <div className={styles.schadePopupTitel}>Type schade</div>
            {SCHADE_TYPES.map(t => (
              <button key={t.type} className={styles.schadeOptie} onClick={() => plaatsPunt(t.type, t.symbol)}>
                <span className={styles.schadeSymbol}>{t.symbol}</span>
                <span>{t.label}</span>
              </button>
            ))}
            <button className={styles.schadeAnnuleer} onClick={() => setPopup(null)}>Annuleer</button>
          </div>
        </>
      )}
    </div>
  );
}
