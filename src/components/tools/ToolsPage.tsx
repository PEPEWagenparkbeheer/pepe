'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BijtellingModal from './BijtellingModal';
import ConsignatieModal from './ConsignatieModal';
import styles from './ToolsPage.module.css';

type ToolKey = 'bijtelling' | 'consignatie' | 'inkoopverklaring';

type Tool =
  | { type: 'modal'; key: ToolKey; icoon: string; titel: string; desc: string }
  | { type: 'intern'; url: string; icoon: string; titel: string; desc: string }
  | { type: 'extern'; url: string; icoon: string; titel: string; desc: string };

const TOOLS: Tool[] = [
  {
    type: 'modal',
    key: 'bijtelling',
    icoon: "\u{1F9EE}",
    titel: 'Bijtelling calculator',
    desc: 'Bereken bijtelling en netto loonbelasting voor zakelijke auto (2022-2026).',
  },
  {
    type: 'modal',
    key: 'consignatie',
    icoon: "\u{1F4CB}",
    titel: 'Consignatie eindafrekening',
    desc: 'Wizard voor netto opbrengst klant na verkoop, met PDF-download.',
  },
  {
    type: 'modal',
    key: 'inkoopverklaring',
    icoon: "\u{1F9FE}",
    titel: 'Inkoopverklaring maken',
    desc: 'Maak inkoopverklaringen (marge) met RDW-gegevens, beheer opgeslagen verklaringen en verstuur via DocuSign.',
  },
  {
    type: 'intern',
    url: '/tools/toestandsrapport',
    icoon: "\u{1F50D}",
    titel: 'Toestandsrapport scanner',
    desc: 'Upload een buitenlands toestandsrapport (PDF) en krijg direct de bijzonderheden waar je op moet letten.',
  },
  {
    type: 'extern',
    url: 'https://app.pepewagenparkbeheer.nl/',
    icoon: "\u{1F4F2}",
    titel: 'Uitwerkapp',
    desc: 'Open de PEPE uitwerkapp in een nieuw tabblad.',
  },
  {
    type: 'extern',
    url: 'https://mobilityonline.eu/nl/pepe/auth/grant_access?client=pepe&ticket=l1DRKTlBX8WKkJB79EOc3MQ5_zxuCj84sedzttiq0lzQPmwh4Hp6F0W9ZZ0eIqvYWaY1',
    icoon: "\u{1F699}",
    titel: 'Car Configurator',
    desc: 'Open de configurator (MobilityOnline) in een nieuw tabblad.',
  },
];

export default function ToolsPage() {
  const router = useRouter();
  const [open, setOpen] = useState<ToolKey | null>(null);

  function klik(t: Tool) {
    if (t.type === 'modal') {
      setOpen(t.key);
    } else if (t.type === 'intern') {
      router.push(t.url);
    } else {
      window.open(t.url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.kop}>
        <h1 className={styles.titel}>Tools</h1>
        <p className={styles.sub}>Handige calculators en hulpmiddelen.</p>
      </div>

      <div className={styles.grid}>
        {TOOLS.map((t) => (
          <button
            key={t.type === 'modal' ? t.key : t.url}
            className={styles.tegel}
            onClick={() => klik(t)}
          >
            {t.type === 'extern' && <span className={styles.externBadge} title="Opent in nieuw tabblad">&#x2197;</span>}
            <span className={styles.tegelIcoon}>{t.icoon}</span>
            <div className={styles.tegelTitel}>{t.titel}</div>
            <div className={styles.tegelDesc}>{t.desc}</div>
          </button>
        ))}
      </div>

      <BijtellingModal open={open === 'bijtelling'} onSluiten={() => setOpen(null)} />
      <ConsignatieModal open={open === 'consignatie'} onSluiten={() => setOpen(null)} />
      <ConsignatieModal open={open === 'inkoopverklaring'} directInkoop onSluiten={() => setOpen(null)} />
    </div>
  );
}