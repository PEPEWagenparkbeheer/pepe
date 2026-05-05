import type { Zoekopdracht } from '@/types';
import type { FilterOptie } from './ZoekenFilters';
import styles from './ZoekenKPI.module.css';

interface Props {
  records: Zoekopdracht[];
  onFilter?: (f: FilterOptie) => void;
}

export default function ZoekenKPI({ records, onFilter }: Props) {
  const actief = records.filter((r) => !r.akkoord && !r.uitgesteld).length;
  const prio = records.filter((r) => !!r.prio && !r.akkoord && !r.uitgesteld).length;
  const terugkoppeling = records.filter((r) => r.uitgewerkt && !r.terugkoppeling && !r.akkoord && !r.uitgesteld).length;
  const uitgesteld = records.filter((r) => !!r.uitgesteld && !r.akkoord).length;

  const kaarten: { label: string; waarde: number; kleur: string; filter: FilterOptie }[] = [
    { label: 'Actieve opdrachten', waarde: actief, kleur: 'blauw', filter: 'actueel' },
    { label: 'Prio', waarde: prio, kleur: prio > 0 ? 'rood' : 'grijs', filter: 'prio' },
    { label: 'Nog geen terugkoppeling', waarde: terugkoppeling, kleur: terugkoppeling > 0 ? 'geel' : 'grijs', filter: 'terugkoppeling' },
    { label: 'Uitgesteld', waarde: uitgesteld, kleur: uitgesteld > 0 ? 'geel' : 'grijs', filter: 'uitgesteld' },
  ];

  return (
    <div className={styles.strip}>
      {kaarten.map(({ label, waarde, kleur, filter }) => (
        <div
          key={label}
          className={`${styles.kaart} ${styles[kleur]} ${onFilter ? styles.klikbaar : ''}`}
          onClick={() => onFilter?.(filter)}
        >
          <div className={styles.waarde}>{waarde}</div>
          <div className={styles.label}>{label}</div>
        </div>
      ))}
    </div>
  );
}
