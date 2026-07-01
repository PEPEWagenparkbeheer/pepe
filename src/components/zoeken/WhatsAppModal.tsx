'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import type { Zoekopdracht } from '@/types';
import styles from './WhatsAppModal.module.css';

type ParseResultaat = Partial<Omit<Zoekopdracht, 'id'>>;

interface Props {
  open: boolean;
  onParse: (resultaat: ParseResultaat) => void;
  onSluiten: () => void;
}

export default function WhatsAppModal({ open, onParse, onSluiten }: Props) {
  const [tekst, setTekst] = useState('');
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');

  async function verwerk() {
    if (!tekst.trim()) return;
    setLaden(true);
    setFout('');

    try {
      const res = await fetch('/api/whatsapp-parse', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tekst }),
      });

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        setFout(`Server fout (${res.status}) — herstart de dev server`);
        return;
      }

      if (!res.ok) {
        setFout(data.error as string ?? 'Kon het bericht niet verwerken.');
        return;
      }

      const resultaat: ParseResultaat = {};
      if (data.klant)    resultaat.klant    = data.klant as string;
      if (data.merk || data.model) {
        resultaat.auto = `${data.merk ?? ''} ${data.model ?? ''}`.trim();
      }
      if (data.km)       resultaat.km       = data.km as string;
      if (data.jaar)     resultaat.jaar     = data.jaar as string;
      if (data.budget)   resultaat.budget   = data.budget as string;
      if (data.btw)      resultaat.btw      = data.btw as string;
      if (Array.isArray(data.kleuren) && data.kleuren.length)  resultaat.kleuren  = data.kleuren as string[];
      if (Array.isArray(data.brandstof) && data.brandstof.length) resultaat.brandstof = data.brandstof as string[];
      if (data.opties && typeof data.opties === 'object')      resultaat.opties   = data.opties as Record<string, boolean>;
      if (data.details)  resultaat.details  = data.details as string;

      onParse(resultaat);
      setTekst('');
      onSluiten();
    } catch {
      setFout('Netwerkfout — probeer opnieuw.');
    } finally {
      setLaden(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.titel}>WhatsApp bericht inlezen</span>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>
        <div className={styles.body}>
          <p className={styles.uitleg}>Plak het bericht — AI vult het formulier automatisch in.</p>
          <div className={styles.voorbeeld}>
            <div className={styles.voorbeeldLabel}>Voorbeeld</div>
            <pre className={styles.voorbeeldTekst}>{`Volkswagen Sharan of Tiguan
Luxe uitvoering, geen R line
Benzine automaat
Zwart of antraciet
Max 130.000 km
Budget 20-25k

Burhan`}</pre>
          </div>
          <textarea
            className={`fi ${styles.tekstvak}`}
            rows={7}
            placeholder="Plak hier het WhatsApp bericht..."
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            disabled={laden}
          />
          {fout && <div className={styles.fout}>{fout}</div>}
          <div className={styles.knoppen}>
            <button className="btn" onClick={onSluiten} disabled={laden}>Annuleer</button>
            <button className="btn btn-a" onClick={verwerk} disabled={!tekst.trim() || laden}>
              {laden ? <span className={styles.laadTekst}><span className={styles.spinner} />Bezig…</span> : '✦ Inlezen met AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
