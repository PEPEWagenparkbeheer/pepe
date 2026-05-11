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

        {/* Wielen (achterste laag) */}
        <rect x="8"   y="56" width="20" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <rect x="152" y="56" width="20" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <rect x="8"   y="264" width="20" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <rect x="152" y="264" width="20" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {/* Velgen */}
        <circle cx="18" cy="76"  r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="162" cy="76" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="18"  cy="284" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="162" cy="284" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Carrosserie buitenlijn */}
        <path
          d="M 66,14 Q 90,8 114,14
             L 140,27 L 157,56
             Q 163,68 163,82 L 163,98
             Q 163,108 154,110
             L 154,180
             Q 163,184 163,196 L 163,268
             Q 163,280 154,282
             L 144,334 Q 116,352 90,354 Q 64,352 36,334
             L 26,282
             Q 17,280 17,268 L 17,196
             Q 17,184 26,180
             L 26,110
             Q 17,108 17,98 L 17,82
             Q 17,68 23,56
             L 40,27 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />

        {/* Voorbumper */}
        <path d="M 54,16 Q 90,10 126,16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {/* Bumper detail lijn */}
        <path d="M 48,24 Q 90,19 132,24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

        {/* Motorkap */}
        <path d="M 27,110 Q 90,103 153,110" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 2.5" />
        {/* Motorkap middenlijn */}
        <line x1="90" y1="18" x2="90" y2="110" stroke="currentColor" strokeWidth="0.8" strokeDasharray="5 4" opacity="0.45" />

        {/* Koplampen */}
        <rect x="38" y="17" width="22" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="120" y="17" width="22" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Voorruit */}
        <path d="M 34,110 L 43,148 L 137,148 L 146,110" fill="none" stroke="currentColor" strokeWidth="1.5" />

        {/* Dak */}
        <rect x="43" y="148" width="94" height="108" rx="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {/* Zonnedak lijn */}
        <rect x="56" y="158" width="68" height="72" rx="5" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5" />

        {/* Achterruit */}
        <path d="M 34,256 L 43,294 L 137,294 L 146,256" fill="none" stroke="currentColor" strokeWidth="1.5" />

        {/* Kofferbak */}
        <path d="M 27,294 Q 90,287 153,294" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 2.5" />

        {/* Achterlichten */}
        <rect x="38" y="330" width="22" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="120" y="330" width="22" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Achterbumper */}
        <path d="M 48,340 Q 90,347 132,340" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M 42,346 Q 90,354 138,346" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

        {/* B-stijl deurscheiding */}
        <line x1="17" y1="202" x2="34" y2="202" stroke="currentColor" strokeWidth="1.5" />
        <line x1="146" y1="202" x2="163" y2="202" stroke="currentColor" strokeWidth="1.5" />

        {/* Buitenspiegels */}
        <path d="M 40,140 L 28,136 L 28,150 L 40,150" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 140,140 L 152,136 L 152,150 L 140,150" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />

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
