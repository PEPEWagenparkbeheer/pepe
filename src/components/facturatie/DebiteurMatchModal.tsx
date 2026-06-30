'use client';

import { useState } from 'react';
import type { MatchKandidaat } from '@/types/match';
import styles from './Facturatie.module.css';

const NIEUW = '__nieuw__';

export interface DebiteurKeuze { debiteurCode?: string; maakNieuw?: boolean }

export default function DebiteurMatchModal({
  klantNaam, kandidaten, onBevestig, onNeemOver, onAnnuleer, busy,
}: {
  klantNaam: string;
  kandidaten: MatchKandidaat[];
  onBevestig: (keuze: DebiteurKeuze) => void;
  onNeemOver: (code: string, naam: string) => void;
  onAnnuleer: () => void;
  busy?: boolean;
}) {
  const [gekozen, setGekozen] = useState<string>(kandidaten[0]?.id ?? NIEUW);
  const isNieuw = gekozen === NIEUW;

  function bevestig() {
    if (isNieuw) {
      onBevestig({ maakNieuw: true });
    } else {
      // Bestaande debiteur: eerst NAW overnemen + controleren, niet meteen boeken.
      const k = kandidaten.find((x) => x.id === gekozen);
      onNeemOver(gekozen, k?.naam ?? klantNaam);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: 560 }}>
        <header className={styles.modalHeader}>
          <span className={styles.modalTitle}>Debiteur kiezen — {klantNaam || 'klant'}</span>
          <button className={styles.closeBtn} onClick={onAnnuleer}>×</button>
        </header>
        <div className={styles.modalBody}>
          <p className={styles.sub}>
            Kies een bestaande Twinfield-debiteur of maak bewust een nieuwe aan. Zo ontstaan er geen
            ongewenste dubbele debiteuren.
          </p>

          {kandidaten.map((k) => (
            <label key={k.id} className={styles.matchOptie}>
              <input type="radio" name="deb" checked={gekozen === k.id} onChange={() => setGekozen(k.id)} />
              <span className={styles.matchInfo}>
                <span className={styles.matchNaam}>{k.naam} <span className={styles.sub}>({k.id})</span></span>
                <span className={styles.matchReden}>{k.reden} · {k.score}%</span>
              </span>
            </label>
          ))}

          <label className={styles.matchOptie}>
            <input type="radio" name="deb" checked={gekozen === NIEUW} onChange={() => setGekozen(NIEUW)} />
            <span className={styles.matchInfo}>
              <span className={styles.matchNaam}>➕ Nieuwe debiteur aanmaken in Twinfield</span>
              <span className={styles.matchReden}>Alleen doen als de klant écht nog niet bestaat</span>
            </span>
          </label>

          {kandidaten.length === 0 && (
            <p className={styles.sub}>Geen bestaande debiteuren gevonden die lijken op deze klant.</p>
          )}
        </div>
        <footer className={styles.modalFooter}>
          <button className={styles.secondary} onClick={onAnnuleer} disabled={busy}>Annuleren</button>
          <button className={styles.primary} onClick={bevestig} disabled={busy}>
            {busy ? 'Bezig…' : isNieuw ? 'Nieuwe debiteur & boek' : 'Gegevens overnemen & controleren'}
          </button>
        </footer>
      </div>
    </div>
  );
}
