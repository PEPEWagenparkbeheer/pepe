'use client';

import { useRef, useState } from 'react';
import styles from './InnamePage.module.css';

export interface SchadePunt {
  x: number; // 0-1 relatief t.o.v. viewBox breedte
  y: number; // 0-1 relatief t.o.v. viewBox hoogte
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

// Afmetingen moeten overeenkomen met de viewBox
const VB_W = 900;
const VB_H = 630;

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
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className={styles.carSvg}
        onClick={handleSvgClick}
      >
        {/* Afbeelding als achtergrond */}
        <image
          href="/car-diagram.png"
          x="0"
          y="0"
          width={VB_W}
          height={VB_H}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Schade markers */}
        {punten.map((p, i) => (
          <g key={i} onClick={(e) => { e.stopPropagation(); verwijderPunt(i); }} style={{ cursor: 'pointer' }}>
            <circle cx={p.x * VB_W} cy={p.y * VB_H} r="14" fill="rgba(220,38,38,0.85)" />
            <text
              x={p.x * VB_W} y={p.y * VB_H + 5}
              textAnchor="middle"
              fontSize="11"
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
          <div className={styles.popupOverlay} />
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
