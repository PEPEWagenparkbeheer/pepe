'use client';

import { useState } from 'react';
import type { TenderInput } from '@/lib/types/tender';
import TenderConfirmModal from './TenderConfirmModal';
import styles from './TenderLab.module.css';

type Fase = 'invoer' | 'bezig' | 'bevestigen';

export default function TenderLab() {
  const [email, setEmail] = useState('');
  const [fase, setFase] = useState<Fase>('invoer');
  const [fout, setFout] = useState<string | null>(null);
  const [parsed, setParsed] = useState<TenderInput | null>(null);

  async function parseEmail() {
    setFout(null);
    if (!email.trim()) {
      setFout('Plak eerst een aanvraagmail.');
      return;
    }
    setFase('bezig');
    try {
      const res = await fetch('/api/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFout(data.error ?? 'Onbekende fout bij parsen');
        setFase('invoer');
        return;
      }
      if (data.geen_aanvraag) {
        setFout('Groq herkende dit niet als lease-aanvraag.');
        setFase('invoer');
        return;
      }
      setParsed(data.parsed as TenderInput);
      setFase('bevestigen');
    } catch (e) {
      setFout('Netwerk-fout: ' + (e as Error).message);
      setFase('invoer');
    }
  }

  function reset() {
    setEmail('');
    setParsed(null);
    setFase('invoer');
    setFout(null);
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.kop}>
        <div className={styles.labBadge}>LAB</div>
        <h1 className={styles.titel}>Lease Tender</h1>
        <p className={styles.sub}>
          Plak een aanvraagmail. Groq parseert hem naar een gestructureerde aanvraag die je kunt
          controleren voordat de portalen worden bevraagd. Dit is een test-omgeving — nog niet
          gekoppeld aan de Lease-module.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.fg}>
          <label>Aanvraagmail (plak de hele tekst inclusief eventuele forwarding-header)</label>
          <textarea
            className="fi"
            placeholder="Plak hier de inkomende mail van de klant..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={14}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
            disabled={fase === 'bezig'}
          />
        </div>

        {fout && <div className={styles.fout}>{fout}</div>}

        <div className={styles.actions}>
          <button
            className="btn btn-a"
            onClick={parseEmail}
            disabled={fase === 'bezig' || !email.trim()}
          >
            {fase === 'bezig' ? 'Groq parseert...' : 'Parse aanvraag'}
          </button>
          {email && fase === 'invoer' && (
            <button className="btn" onClick={() => setEmail('')}>Wissen</button>
          )}
        </div>
      </div>

      {fase === 'bevestigen' && parsed && (
        <TenderConfirmModal
          input={parsed}
          rawEmail={email}
          onSluiten={() => setFase('invoer')}
          onReset={reset}
        />
      )}
    </div>
  );
}
