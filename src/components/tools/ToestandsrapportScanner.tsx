'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RapportStatus, Toestandsrapport } from '@/types';
import styles from './ToestandsrapportScanner.module.css';

function stoplicht(status: RapportStatus): string {
  switch (status) {
    case 'goed':    return '🟢';
    case 'let_op':  return '🟠';
    case 'slecht':  return '🔴';
    default:        return '⚪';
  }
}

export default function ToestandsrapportScanner() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [geselecteerdBestand, setGeselecteerdBestand] = useState<File | null>(null);
  const [resultaat, setResultaat] = useState<Toestandsrapport | null>(null);
  const [geschiedenis, setGeschiedenis] = useState<Toestandsrapport[]>([]);
  const [actiefId, setActiefId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/toestandsrapport')
      .then((r) => r.json())
      .then((data: Toestandsrapport[]) => setGeschiedenis(data))
      .catch(() => {});
  }, []);

  function kiesBestand(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFout('Alleen PDF-bestanden zijn toegestaan.');
      return;
    }
    setGeselecteerdBestand(file);
    setFout(null);
    setResultaat(null);
    setActiefId(null);
  }

  async function analyseer() {
    if (!geselecteerdBestand) return;
    setLaden(true);
    setFout(null);

    const fd = new FormData();
    fd.append('file', geselecteerdBestand);

    try {
      const r = await fetch('/api/toestandsrapport', { method: 'POST', body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Analyse mislukt' }));
        setFout(e.error ?? 'Analyse mislukt');
        return;
      }
      const rapport: Toestandsrapport = await r.json();
      setResultaat(rapport);
      setActiefId(rapport.id);
      setGeschiedenis((prev) => [rapport, ...prev.filter((g) => g.id !== rapport.id)]);
    } catch {
      setFout('Netwerkfout — probeer opnieuw.');
    } finally {
      setLaden(false);
    }
  }

  function toonRapport(r: Toestandsrapport) {
    setResultaat(r);
    setActiefId(r.id);
    setGeselecteerdBestand(null);
  }

  async function verwijder(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/toestandsrapport/${id}`, { method: 'DELETE' });
    setGeschiedenis((prev) => prev.filter((r) => r.id !== id));
    if (actiefId === id) { setResultaat(null); setActiefId(null); }
  }

  const autoNaam = resultaat
    ? [resultaat.merk, resultaat.model].filter(Boolean).join(' ') || resultaat.bestandsnaam || 'Rapport'
    : null;

  return (
    <div className={styles.pagina}>
      {/* Koptekst */}
      <div className={styles.kop}>
        <button className={styles.terugKnop} onClick={() => router.push('/tools')}>
          ← Terug naar Tools
        </button>
        <h1 className={styles.titel}>Toestandsrapport scanner</h1>
        <p className={styles.sub}>
          Upload een buitenlands toestandsrapport (PDF) voor automatische analyse
        </p>
      </div>

      {/* Upload */}
      <div className={styles.uploadBlok}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && kiesBestand(e.target.files[0])}
        />
        <div className={styles.uploadRij}>
          <button className={styles.kiesKnop} onClick={() => fileInputRef.current?.click()}>
            PDF kiezen
          </button>
          <span className={styles.bestandsnaam}>
            {geselecteerdBestand?.name ?? (resultaat?.bestandsnaam ?? 'Geen bestand gekozen')}
          </span>
          <button
            className={styles.analyseerKnop}
            onClick={analyseer}
            disabled={!geselecteerdBestand || laden}
          >
            {laden ? 'Bezig…' : 'Analyseer rapport'}
          </button>
        </div>
        {fout && <p className={styles.fout}>{fout}</p>}
        {laden && (
          <p className={styles.laadTekst}>
            Rapport wordt gelezen en geanalyseerd — dit duurt 20-40 seconden…
          </p>
        )}
      </div>

      {/* Resultaat */}
      {resultaat && (
        <div className={styles.resultaatBlok}>
          <div className={styles.autoHeader}>
            <span className={styles.autoNaam}>{autoNaam}</span>
            {resultaat.kenteken && (
              <span className={styles.kenteken}>{resultaat.kenteken}</span>
            )}
            {resultaat.km_stand && (
              <span className={styles.kmStand}>{resultaat.km_stand}</span>
            )}
          </div>

          {resultaat.conclusie && (
            <div className={styles.conclusieBlok}>{resultaat.conclusie}</div>
          )}

          <div className={styles.bijzonderheden}>
            {(resultaat.bijzonderheden ?? []).map((b) => (
              <div key={b.sleutel} className={styles.bijRij}>
                <span className={styles.icoon}>{stoplicht(b.status)}</span>
                <span className={styles.bijLabel}>{b.label}</span>
                <span className={styles.bijTekst}>{b.tekst}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geschiedenis */}
      {geschiedenis.length > 0 && (
        <div className={styles.geschiedenisBlok}>
          <div className={styles.geschiedenisKop}>Eerdere rapporten</div>
          <div className={styles.geschiedenisLijst}>
            {geschiedenis.map((r) => (
              <div
                key={r.id}
                className={[styles.gRij, r.id === actiefId ? styles.actief : ''].join(' ')}
                onClick={() => toonRapport(r)}
              >
                <div className={styles.gInfo}>
                  <div className={styles.gAuto}>
                    {[r.merk, r.model].filter(Boolean).join(' ') || r.bestandsnaam || 'Rapport'}
                  </div>
                  <div className={styles.gMeta}>
                    {r.kenteken && <span>{r.kenteken}</span>}
                    {r.km_stand && <span>{r.km_stand}</span>}
                    <span>
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString('nl-NL', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>
                </div>
                <div className={styles.gStoplicht}>
                  {(r.bijzonderheden ?? [])
                    .filter((b) => b.status !== 'onbekend')
                    .map((b) => (
                      <span key={b.sleutel} title={b.label}>
                        {stoplicht(b.status)}
                      </span>
                    ))}
                </div>
                <button
                  className={styles.verwijderKnop}
                  onClick={(e) => verwijder(r.id, e)}
                  title="Verwijderen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
