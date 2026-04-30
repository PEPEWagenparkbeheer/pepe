import type { Zoekopdracht } from '@/types';
import styles from './ZoekenKPI.module.css';

interface Props {
  records: Zoekopdracht[];
}

export default function ZoekenKPI({ records }: Props) {
  const actueel = records.filter((r) => !r.akkoord && !r.uitgesteld).length;
  const uitgewerkt = records.filter((r) => r.uitgewerkt && !r.akkoord && !r.uitgesteld).length;
  const akkoord = records.filter((r) => r.akkoord).length;
  const uitgesteld = records.filter((r) => r.uitgesteld).length;

  const kaarten = [
    { label: 'Actueel', waarde: actueel, kleur: 'blauw' },
    { label: 'Uitgewerkt', waarde: uitgewerkt, kleur: 'geel' },
    { label: 'Akkoord', waarde: akkoord, kleur: 'groen' },
    { label: 'Uitgesteld', waarde: uitgesteld, kleur: 'grijs' },
  ];

  return (
    <div className={styles.strip}>
      {kaarten.map(({ label, waarde, kleur }) => (
        <div key={label} className={`${styles.kaart} ${styles[kleur]}`}>
          <div className={styles.waarde}>{waarde}</div>
          <div className={styles.label}>{label}</div>
        </div>
      ))}
    </div>
  );
}
