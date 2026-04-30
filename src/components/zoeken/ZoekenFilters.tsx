import type { Zoekopdracht } from '@/types';
import styles from './ZoekenFilters.module.css';

export type FilterOptie = 'actueel' | 'uitgesteld' | 'akkoord' | 'archief';

interface Props {
  actief: FilterOptie;
  records: Zoekopdracht[];
  onChange: (f: FilterOptie) => void;
}

const FILTERS: { k: FilterOptie; l: string }[] = [
  { k: 'actueel', l: 'Actueel' },
  { k: 'uitgesteld', l: '⏸ Uitgesteld' },
  { k: 'akkoord', l: '✅ Akkoord' },
  { k: 'archief', l: 'Archief' },
];

function telFilter(records: Zoekopdracht[], k: FilterOptie): number {
  if (k === 'actueel') return records.filter((r) => !r.akkoord && !r.uitgesteld).length;
  if (k === 'uitgesteld') return records.filter((r) => !!r.uitgesteld).length;
  if (k === 'akkoord' || k === 'archief') return records.filter((r) => r.akkoord).length;
  return records.length;
}

export default function ZoekenFilters({ actief, records, onChange }: Props) {
  return (
    <div className={styles.balk}>
      {FILTERS.map(({ k, l }) => (
        <button
          key={k}
          className={`${styles.tab} ${actief === k ? styles.on : ''}`}
          onClick={() => onChange(k)}
        >
          {l}
          <span className={styles.tel}>{telFilter(records, k)}</span>
        </button>
      ))}
    </div>
  );
}
