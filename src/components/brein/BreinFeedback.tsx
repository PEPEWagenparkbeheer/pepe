'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import type { BreinFeedbackScope } from '@/lib/brein/feedback';
import styles from './BreinFeedback.module.css';

interface Props {
  scope: BreinFeedbackScope;
  sourceId?: string | null;
  originalContext?: string | null;
  conceptResponse?: string | null;
}

export default function BreinFeedback({
  scope,
  sourceId,
  originalContext,
  conceptResponse,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tekst, setTekst] = useState('');
  const [opslaan, setOpslaan] = useState(false);
  const [opgeslagen, setOpgeslagen] = useState(false);

  async function verstuurFeedback() {
    if (tekst.trim().length < 3) return;
    setOpslaan(true);
    try {
      const res = await fetch('/api/brein/feedback', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scope,
          feedback: tekst.trim(),
          sourceId,
          originalContext,
          conceptResponse,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Feedback opslaan mislukt');
      setTekst('');
      setOpgeslagen(true);
      setOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Feedback opslaan mislukt');
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.knop} type="button" onClick={() => { setOpen((waarde) => !waarde); setOpgeslagen(false); }}>
        💡 Feedback aan Brein
      </button>
      {opgeslagen && <span className={styles.succes}>✓ Onthouden voor volgende reacties</span>}
      {open && (
        <div className={styles.paneel}>
          <label htmlFor={`brein-feedback-${scope}-${sourceId ?? 'nieuw'}`}>Waar moet Brein voortaan aan denken of op letten?</label>
          <textarea
            id={`brein-feedback-${scope}-${sourceId ?? 'nieuw'}`}
            value={tekst}
            onChange={(event) => setTekst(event.target.value)}
            placeholder="Bijv. noem altijd eerst de levertijd, of gebruik hier een informelere toon…"
            maxLength={1000}
            rows={3}
            autoFocus
          />
          <div className={styles.voet}>
            <span>{tekst.length}/1000 · geldt voor toekomstige {scope === 'leads' ? 'leadreacties' : 'Brein-reacties'}</span>
            <button type="button" onClick={() => void verstuurFeedback()} disabled={opslaan || tekst.trim().length < 3}>
              {opslaan ? 'Opslaan…' : 'Feedback opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
