'use client';

import { useState } from 'react';
import type { MatchKandidaat, MatchKeuze, MatchSuggesties } from '@/types/match';
import styles from './MatchBevestigModal.module.css';

function EntiteitKeuze({
  label,
  kandidaten,
  gekozenId,
  onKies,
}: {
  label: string;
  kandidaten: MatchKandidaat[];
  gekozenId: string | null;
  onKies: (id: string | null) => void;
}) {
  return (
    <div className={styles.entiteit}>
      <div className={styles.entiteitLabel}>{label}</div>
      {kandidaten.map((k) => (
        <label key={k.id} className={`${styles.optie} ${gekozenId === k.id ? styles.actief : ''}`}>
          <input type="radio" name={label} checked={gekozenId === k.id} onChange={() => onKies(k.id)} />
          <div className={styles.kandidaatInfo}>
            <span className={styles.kandidaatNaam}>{k.naam}</span>
            {k.email && <span className={styles.kandidaatDetail}>{k.email}</span>}
            <span className={styles.kandidaatReden}>{k.reden} · {k.score}%</span>
          </div>
        </label>
      ))}
      <label className={`${styles.optie} ${gekozenId === null ? styles.actief : ''}`}>
        <input type="radio" name={label} checked={gekozenId === null} onChange={() => onKies(null)} />
        <div className={styles.kandidaatInfo}>
          <span className={styles.kandidaatNaam}>Nieuw aanmaken</span>
          <span className={styles.kandidaatDetail}>Maakt een nieuw record aan in HubSpot</span>
        </div>
      </label>
    </div>
  );
}

interface Props {
  suggesties: MatchSuggesties;
  onBevestig: (keuze: MatchKeuze) => void;
  onAnnuleer: () => void;
}

export default function MatchBevestigModal({ suggesties, onBevestig, onAnnuleer }: Props) {
  const heeftBedrijf = suggesties.bedrijf.kandidaten.length > 0;
  const heeftBerijder = suggesties.berijder.kandidaten.length > 0;

  const [bedrijfId, setBedrijfId] = useState<string | null>(
    suggesties.bedrijf.kandidaten[0]?.id ?? null,
  );
  const [berijderId, setBerijderId] = useState<string | null>(
    suggesties.berijder.kandidaten[0]?.id ?? null,
  );

  function bevestig() {
    const keuze: MatchKeuze = {};
    if (heeftBedrijf) keuze.bedrijfId = bedrijfId;
    if (heeftBerijder) keuze.berijderId = berijderId;
    onBevestig(keuze);
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onAnnuleer(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <strong>Mogelijk bestaande records gevonden</strong>
          <span className={styles.subtitel}>Kies per entiteit of je een bestaand record wilt gebruiken of nieuw wilt aanmaken.</span>
        </div>

        <div className={styles.body}>
          {heeftBedrijf && (
            <EntiteitKeuze
              label="Bedrijf"
              kandidaten={suggesties.bedrijf.kandidaten}
              gekozenId={bedrijfId}
              onKies={setBedrijfId}
            />
          )}
          {heeftBerijder && (
            <EntiteitKeuze
              label="Berijder"
              kandidaten={suggesties.berijder.kandidaten}
              gekozenId={berijderId}
              onKies={setBerijderId}
            />
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnAnnuleer} onClick={onAnnuleer}>Annuleren</button>
          <button className={styles.btnBevestig} onClick={bevestig}>Doorgaan naar HubSpot</button>
        </div>
      </div>
    </div>
  );
}
