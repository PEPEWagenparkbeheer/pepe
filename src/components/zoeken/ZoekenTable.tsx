'use client';

import { KLEUR_MAP, OPTIES } from '@/lib/constants';
import type { Zoekopdracht } from '@/types';
import styles from './ZoekenTable.module.css';

export type SortVeld = 'klant' | 'auto' | 'budget' | 'btw' | null;

interface Props {
  rows: Zoekopdracht[];
  sortVeld: SortVeld;
  sortRichting: 'asc' | 'desc';
  onSort: (veld: SortVeld) => void;
  onEdit: (rec: Zoekopdracht) => void;
  onQuickToggle: (id: number, veld: keyof Zoekopdracht) => void;
  onTogglePrio: (id: number) => void;
  onAkkoord: (id: number) => void;
}

const QUICK_VELDEN: { veld: keyof Zoekopdracht; titel: string }[] = [
  { veld: 'uitgewerkt', titel: 'Uit' },
  { veld: 'terugkoppeling', titel: 'Tkppg' },
  { veld: 'dealer', titel: 'Dealer' },
  { veld: 'inkopen', titel: 'Inkoop' },
  { veld: 'contract', titel: 'Contract' },
];

function Checkbox({
  aan,
  onClick,
}: {
  aan: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`${styles.cb} ${aan ? styles.cbOn : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
    >
      {aan && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function KolomHeader({
  veld,
  label,
  sortVeld,
  sortRichting,
  onSort,
}: {
  veld: SortVeld;
  label: string;
  sortVeld: SortVeld;
  sortRichting: 'asc' | 'desc';
  onSort: (v: SortVeld) => void;
}) {
  const actief = sortVeld === veld;
  return (
    <th
      className={actief ? (sortRichting === 'asc' ? styles.sa : styles.sd) : ''}
      onClick={() => onSort(veld)}
    >
      {label}
    </th>
  );
}

export default function ZoekenTable({
  rows, sortVeld, sortRichting, onSort, onEdit, onQuickToggle, onTogglePrio, onAkkoord,
}: Props) {
  if (!rows.length) {
    return (
      <div className={styles.leeg}>Geen zoekopdrachten gevonden</div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }}>🚩</th>
            <KolomHeader veld="klant" label="Klant" sortVeld={sortVeld} sortRichting={sortRichting} onSort={onSort} />
            <KolomHeader veld="auto" label="Auto / Model" sortVeld={sortVeld} sortRichting={sortRichting} onSort={onSort} />
            <th>Kleuren</th>
            <th>Details</th>
            <KolomHeader veld="budget" label="Budget" sortVeld={sortVeld} sortRichting={sortRichting} onSort={onSort} />
            <KolomHeader veld="btw" label="BTW/Marge" sortVeld={sortVeld} sortRichting={sortRichting} onSort={onSort} />
            {QUICK_VELDEN.map(({ veld, titel }) => (
              <th key={veld} className={styles.chkKolom}>{titel}</th>
            ))}
            <th>Acties</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tags = OPTIES.filter((o) => r.opties?.[o.k]).map((o) => (
              <span key={o.k} className={styles.tag}>{o.l}</span>
            ));
            const dots = (r.kleuren ?? []).slice(0, 6).map((k) => (
              <div
                key={k}
                className={styles.kleurDot}
                title={k}
                style={{ background: KLEUR_MAP[k] ?? '#888' }}
              />
            ));

            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                <td onClick={(e) => { e.stopPropagation(); onTogglePrio(r.id); }} style={{ cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ opacity: r.prio ? 1 : 0.15 }}>🚩</span>
                </td>
                <td>
                  <div className={styles.klantNaam}>{r.klant}</div>
                  {r.wiezoekt && <div className={styles.sub}>{r.wiezoekt}</div>}
                </td>
                <td>
                  <div className={styles.autoNaam}>{r.auto}</div>
                  {r.jaar && <div className={styles.sub}>{r.jaar}</div>}
                </td>
                <td>
                  <div className={styles.kleurDots}>{dots}</div>
                </td>
                <td>
                  <div className={styles.details}>{r.details}</div>
                  {tags.length > 0 && <div className={styles.tags}>{tags}</div>}
                </td>
                <td>
                  {r.budget && (
                    <span className={styles.budget}>€ {r.budget}</span>
                  )}
                  {r.km && <div className={styles.sub}>{r.km} km</div>}
                </td>
                <td>
                  {r.btw && <span className={styles.btwBadge}>{r.btw}</span>}
                </td>
                {QUICK_VELDEN.map(({ veld }) => (
                  <td key={veld} className={styles.chkKolom}>
                    <Checkbox
                      aan={!!r[veld]}
                      onClick={() => onQuickToggle(r.id, veld)}
                    />
                  </td>
                ))}
                <td onClick={(e) => e.stopPropagation()}>
                  {r.akkoord ? (
                    <span className="badge-ok">✓ Akkoord</span>
                  ) : (
                    <button
                      className={styles.akkoordBtn}
                      onClick={(e) => { e.stopPropagation(); onAkkoord(r.id); }}
                    >
                      Akkoord
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
