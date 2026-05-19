'use client';

import { useState } from 'react';
import BijtellingModal from './BijtellingModal';
import ConsignatieModal from './ConsignatieModal';
import styles from './ToolsPage.module.css';

type ToolKey = 'bijtelling' | 'consignatie';

interface Tool {
  key: ToolKey;
  icoon: string;
  titel: string;
  desc: string;
}

const TOOLS: Tool[] = [
  {
    key: 'bijtelling',
    icoon: '🧮',
    titel: 'Bijtelling calculator',
    desc: 'Bereken bijtelling en netto loonbelasting voor zakelijke auto (2022-2026).',
  },
  {
    key: 'consignatie',
    icoon: '📋',
    titel: 'Consignatie eindafrekening',
    desc: 'Wizard voor netto opbrengst klant na verkoop, met PDF-download.',
  },
];

export default function ToolsPage() {
  const [open, setOpen] = useState<ToolKey | null>(null);

  return (
    <div className={styles.pagina}>
      <div className={styles.kop}>
        <h1 className={styles.titel}>Tools</h1>
        <p className={styles.sub}>Handige calculators en hulpmiddelen.</p>
      </div>

      <div className={styles.grid}>
        {TOOLS.map((t) => (
          <button key={t.key} className={styles.tegel} onClick={() => setOpen(t.key)}>
            <span className={styles.tegelIcoon}>{t.icoon}</span>
            <div className={styles.tegelTitel}>{t.titel}</div>
            <div className={styles.tegelDesc}>{t.desc}</div>
          </button>
        ))}
      </div>

      <BijtellingModal open={open === 'bijtelling'} onSluiten={() => setOpen(null)} />
      <ConsignatieModal open={open === 'consignatie'} onSluiten={() => setOpen(null)} />
    </div>
  );
}
