'use client';

import { useState } from 'react';
import { KLEUREN, MERKEN_LIJST } from '@/lib/constants';
import type { Zoekopdracht } from '@/types';
import styles from './WhatsAppModal.module.css';

type ParseResultaat = Partial<Omit<Zoekopdracht, 'id'>>;

function parseWhatsApp(raw: string): ParseResultaat {
  const tekst = raw.toLowerCase();
  const resultaat: ParseResultaat = { kleuren: [], opties: {} };

  // Budget
  const budgetMatch = tekst.match(/budget[:\s]*[€]?\s*(\d[\d.,\s]*k?)/i)
    ?? tekst.match(/(\d{2,3})[.,]?(\d{3})?\s*(?:euro|eur|€)/i)
    ?? tekst.match(/(\d{2,3})k\b/i);
  if (budgetMatch) {
    resultaat.budget = budgetMatch[1].replace(/[.,\s]/g, '').replace(/k$/, '000');
  }

  // Kilometerstand
  const kmMatch = tekst.match(/(\d{2,3})[.,]?(\d{3})?\s*km/i);
  if (kmMatch) {
    const km = kmMatch[0].replace(/\s*km/i, '').trim();
    resultaat.km = km;
  }

  // Bouwjaar
  const jaarMatch = tekst.match(/(20\d{2})\s*[-–]\s*(20\d{2})/i)
    ?? tekst.match(/\b(20\d{2})\b/);
  if (jaarMatch) {
    resultaat.jaar = jaarMatch[0];
  }

  // Merk + model
  for (const merk of MERKEN_LIJST) {
    if (tekst.includes(merk.toLowerCase())) {
      const regexModel = new RegExp(merk + '\\s+([\\w\\s-]+)', 'i');
      const modelMatch = raw.match(regexModel);
      resultaat.auto = modelMatch
        ? `${merk} ${modelMatch[1].trim().split('\n')[0]}`
        : merk;
      break;
    }
  }

  // Kleuren
  const gevondenKleuren: string[] = [];
  for (const kleur of KLEUREN) {
    if (tekst.includes(kleur.toLowerCase())) gevondenKleuren.push(kleur);
  }
  resultaat.kleuren = gevondenKleuren;

  // BTW / Marge
  if (tekst.includes('btw')) resultaat.btw = 'BTW';
  else if (tekst.includes('marge')) resultaat.btw = 'Marge';

  // Klant (laatste niet-lege regel die niet op een bekend veld lijkt)
  const regels = raw.split('\n').map((r) => r.trim()).filter(Boolean);
  const klantRegel = regels.findLast(
    (r) =>
      r.length > 1 &&
      r.length < 40 &&
      !/\d{4}|\bkm\b|budget|euro|benzine|diesel|hybride|elektrisch/i.test(r) &&
      !MERKEN_LIJST.some((m) => r.toLowerCase().includes(m.toLowerCase()))
  );
  if (klantRegel) resultaat.klant = klantRegel;

  return resultaat;
}

interface Props {
  open: boolean;
  onParse: (resultaat: ParseResultaat) => void;
  onSluiten: () => void;
}

export default function WhatsAppModal({ open, onParse, onSluiten }: Props) {
  const [tekst, setTekst] = useState('');
  const [fout, setFout] = useState('');

  function verwerk() {
    if (!tekst.trim()) return;
    try {
      const resultaat = parseWhatsApp(tekst);
      onParse(resultaat);
      setTekst('');
      setFout('');
      onSluiten();
    } catch {
      setFout('Kon het bericht niet verwerken.');
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.titel}>WhatsApp bericht inlezen</span>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>
        <div className={styles.body}>
          <p className={styles.uitleg}>Plak het bericht — het formulier wordt automatisch ingevuld.</p>
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
          />
          {fout && <div className={styles.fout}>{fout}</div>}
          <div className={styles.knoppen}>
            <button className="btn" onClick={onSluiten}>Annuleer</button>
            <button className="btn btn-a" onClick={verwerk}>✦ Inlezen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
