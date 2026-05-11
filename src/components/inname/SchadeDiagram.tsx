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

        {/* Wielen — ronde banden + velg */}
        <circle cx="18"  cy="80"  r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="162" cy="80"  r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="18"  cy="294" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="162" cy="294" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {/* Velgen (binnenring) */}
        <circle cx="18"  cy="80"  r="9"  fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="162" cy="80"  r="9"  fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="18"  cy="294" r="9"  fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="162" cy="294" r="9"  fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Carrosserie buitenlijn — met wielkasten */}
        <path
          d="M 68,14 Q 90,8 112,14
             L 136,26
             C 150,34 158,50 160,66
             C 162,72 162,76 160,82
             C 158,90 152,100 142,104
             L 142,188
             C 152,192 160,202 162,212
             C 164,222 162,256 160,270
             C 158,282 150,294 136,300
             L 118,336 Q 90,350 62,336
             L 44,300
             C 30,294 22,282 20,270
             C 18,256 16,222 18,212
             C 20,202 28,192 38,188
             L 38,104
             C 28,100 22,90 20,82
             C 18,76 18,72 20,66
             C 22,50 30,34 44,26 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />

        {/* Voorbumper */}
        <path d="M 54,15 Q 90,9 126,15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M 46,24 Q 90,18 134,24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

        {/* Koplampen */}
        <rect x="40" y="16" width="20" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="120" y="16" width="20" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Motorkap scheidingslijn */}
        <path d="M 28,104 Q 90,97 152,104" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 2.5" />
        {/* Motorkap V-plooilijnen */}
        <line x1="90" y1="18"  x2="90"  y2="104" stroke="currentColor" strokeWidth="1"   opacity="0.4" />
        <line x1="44" y1="28"  x2="90"  y2="104" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        <line x1="136" y1="28" x2="90"  y2="104" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />

        {/* Voorruit */}
        <path d="M 34,104 L 44,146 L 136,146 L 146,104" fill="none" stroke="currentColor" strokeWidth="1.5" />

        {/* Dak */}
        <rect x="44" y="146" width="92" height="110" rx="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {/* Zonnedak */}
        <rect x="58" y="157" width="64" height="74" rx="5" fill="none" stroke="currentColor" strokeWidth="0.9" strokeDasharray="3 2" opacity="0.55" />

        {/* Achterruit */}
        <path d="M 34,256 L 44,298 L 136,298 L 146,256" fill="none" stroke="currentColor" strokeWidth="1.5" />

        {/* Kofferbak scheidingslijn */}
        <path d="M 28,298 Q 90,291 152,298" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 2.5" />
        {/* Kofferbak V-lijn */}
        <line x1="90" y1="298" x2="90"  y2="336" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        <line x1="44" y1="300" x2="90"  y2="336" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
        <line x1="136" y1="300" x2="90" y2="336" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />

        {/* Achterlichten */}
        <rect x="40" y="332" width="20" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="120" y="332" width="20" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />

        {/* Achterbumper */}
        <path d="M 46,342 Q 90,348 134,342" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M 62,348 Q 90,352 118,348" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

        {/* B-stijl deurscheiding */}
        <line x1="18"  y1="200" x2="36"  y2="200" stroke="currentColor" strokeWidth="1.5" />
        <line x1="144" y1="200" x2="162" y2="200" stroke="currentColor" strokeWidth="1.5" />

        {/* Buitenspiegels */}
        <path d="M 38,138 L 26,134 L 26,148 L 38,148" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 142,138 L 154,134 L 154,148 L 142,148" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />

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
