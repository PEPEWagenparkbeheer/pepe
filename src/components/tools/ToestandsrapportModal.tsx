'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import type { Toestandsrapport, RapportStatus } from '@/types';
import styles from './ToestandsrapportModal.module.css';

interface Props {
  open: boolean;
  onSluiten: () => void;
}

function stoplicht(status: RapportStatus): string {
  switch (status) {
    case 'goed': return '🟢';
    case 'let_op': return '🟠';
    case 'slecht': return '🔴';
    default: return '⚪';
  }
}

export default function ToestandsrapportModal({ open, onSluiten }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bestand, setBestand] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [resultaat, setResultaat] = useState<Toestandsrapport | null>(null);
  const [geschiedenis, setGeschiedenis] = useState<Toestandsrapport[]>([]);
  const [actiefId, setActiefId] = useState<string | null>(null);

  const laadGeschiedenis = useCallback(async () => {
    const hdrs = await authHeaders();
    const res = await fetch('/api/toestandsrapport', { headers: hdrs });
    if (res.ok) setGeschiedenis(await res.json());
  }, []);

  useEffect(() => {
    if (open) laadGeschiedenis();
  }, [open, laadGeschiedenis]);

  if (!open) return null;

  async function analyseer() {
    if (!bestand) return;
    setBezig(true);
    setFout('');
    setResultaat(null);

    const fd = new FormData();
    fd.append('file', bestand);

    const hdrs = await authHeaders();
    const res = await fetch('/api/toestandsrapport', {
      method: 'POST',
      headers: hdrs,
      body: fd,
    });

    setBezig(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setFout(body.error ?? 'Analyse mislukt');
      return;
    }

    const rapport: Toestandsrapport = await res.json();
    setResultaat(rapport);
    setActiefId(rapport.id);
    await laadGeschiedenis();
  }

  function toonGeschiedenisRapport(r: Toestandsrapport) {
    setResultaat(r);
    setActiefId(r.id);
  }

  async function verwijder(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const hdrs = await authHeaders();
    await fetch('/api/toestandsrapport/' + id, { method: 'DELETE', headers: hdrs });
    if (actiefId === id) { setResultaat(null); setActiefId(null); }
    await laadGeschiedenis();
  }

  return (
    <div className={styles.overlay} onClick={onSluiten}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.titel}>Toestandsrapport scanner</div>
            <div className={styles.sub}>Upload een buitenlands toestandsrapport (PDF) voor automatische analyse</div>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten} aria-label="Sluiten">&#x2715;</button>
        </div>

        <div className={styles.body}>
          {/* Upload */}
          <div className={styles.uploadZone}>
            <div className={styles.uploadRij}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
              />
              <button
                className={styles.analyseerKnop}
                style={{ background: '#546e7a' }}
                onClick={() => fileRef.current?.click()}
              >
                PDF kiezen
              </button>
              <span className={styles.bestandsnaam}>
                {bestand ? bestand.name : 'Geen bestand gekozen'}
              </span>
              <button
                className={styles.analyseerKnop}
                disabled={!bestand || bezig}
                onClick={analyseer}
              >
                {bezig ? 'Bezig…' : 'Analyseer rapport'}
              </button>
            </div>
            {fout && <div className={styles.foutMelding}>{fout}</div>}
          </div>

          {/* Resultaat */}
          {resultaat && (
            <div className={styles.resultaat}>
              <div className={styles.autoHeader}>
                {[resultaat.merk, resultaat.model].filter(Boolean).join(' ') || 'Onbekende auto'}
                {resultaat.kenteken && <> &middot; {resultaat.kenteken}</>}
                {resultaat.km_stand && <span className={styles.autoKm}>{resultaat.km_stand}</span>}
              </div>
              {resultaat.conclusie && (
                <div className={styles.conclusieBlok}>{resultaat.conclusie}</div>
              )}
              <div className={styles.bijzonderheden}>
                {(resultaat.bijzonderheden ?? []).map((b) => (
                  <div key={b.sleutel} className={styles.bijzonderheidRij}>
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
            <>
              <hr className={styles.scheidingslijn} />
              <div>
                <div className={styles.geschiedenisKop}>Eerdere rapporten</div>
                <div className={styles.geschiedenisLijst}>
                  {geschiedenis.map((r) => (
                    <div
                      key={r.id}
                      className={[styles.geschiedenisRij, r.id === actiefId ? styles.actief : ''].join(' ')}
                      onClick={() => toonGeschiedenisRapport(r)}
                    >
                      <div className={styles.gInfo}>
                        <div className={styles.gAuto}>
                          {[r.merk, r.model].filter(Boolean).join(' ') || r.bestandsnaam || 'Rapport'}
                          {r.kenteken && <> &middot; {r.kenteken}</>}
                        </div>
                        <div className={styles.gMeta}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          {r.door ? ' · ' + r.door.split('@')[0] : ''}
                        </div>
                      </div>
                      <button
                        className={styles.verwijderKnop}
                        onClick={(e) => verwijder(r.id, e)}
                        title="Verwijder uit geschiedenis"
                      >
                        &#x1F5D1;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}