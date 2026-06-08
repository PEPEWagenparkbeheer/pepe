'use client';

import { useMemo, useState } from 'react';
import {
  useBreinMessages,
  type BreinMessage,
  type BreinStatus,
} from '@/hooks/useBreinMessages';
import styles from './BreinInbox.module.css';

const STATUS_TABS: { key: BreinStatus | 'alle'; label: string }[] = [
  { key: 'nieuw', label: 'Nieuw' },
  { key: 'opgepakt', label: 'Opgepakt' },
  { key: 'in_behandeling', label: 'In behandeling' },
  { key: 'afgehandeld', label: 'Afgehandeld' },
  { key: 'overgeslagen', label: 'Overgeslagen' },
  { key: 'alle', label: 'Alle' },
];

const PRIO_LABEL: Record<string, string> = {
  laag: 'Laag',
  normaal: 'Normaal',
  hoog: 'Hoog',
  urgent: 'Urgent',
};

function initialen(naam: string | null, email: string | null): string {
  const bron = (naam || email || '?').trim();
  const delen = bron.split(/[\s@.]+/).filter(Boolean);
  if (delen.length >= 2) return (delen[0][0] + delen[1][0]).toUpperCase();
  return bron.slice(0, 2).toUpperCase();
}

function relatieveTijd(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const verschil = Date.now() - d.getTime();
  const min = Math.round(verschil / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min`;
  const uur = Math.round(min / 60);
  if (uur < 24) return `${uur} uur`;
  const dag = Math.round(uur / 24);
  if (dag < 7) return `${dag} d`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function BreinInbox() {
  const { messages, loading, error, refresh, setStatus } = useBreinMessages();
  const [tab, setTab] = useState<BreinStatus | 'alle'>('nieuw');
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);

  const tellingen = useMemo(() => {
    const t: Record<string, number> = { alle: messages.length };
    for (const m of messages) t[m.status] = (t[m.status] ?? 0) + 1;
    return t;
  }, [messages]);

  const zichtbaar = useMemo(
    () => (tab === 'alle' ? messages : messages.filter((m) => m.status === tab)),
    [messages, tab],
  );

  const actief: BreinMessage | undefined = useMemo(
    () => messages.find((m) => m.id === geselecteerd),
    [messages, geselecteerd],
  );

  return (
    <div className={styles.pagina}>
      <header className={styles.kop}>
        <div>
          <h1 className={styles.titel}>
            <span className={styles.brein}>🧠</span> BREIN Inbox
          </h1>
          <p className={styles.subkop}>
            {messages[0]?.mailbox ?? 'fues@pepewagenparkbeheer.nl'}
          </p>
        </div>
        <button className={styles.vernieuwKnop} onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Laden…' : '↻ Vernieuwen'}
        </button>
      </header>

      <div className={styles.tabs}>
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActief : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            <span className={styles.telling}>{tellingen[key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <div className={styles.fout}>Fout bij laden: {error}</div>}

      <div className={styles.layout}>
        <div className={styles.lijst}>
          {!loading && zichtbaar.length === 0 && (
            <div className={styles.leeg}>Geen berichten in deze weergave.</div>
          )}
          {zichtbaar.map((m) => (
            <button
              key={m.id}
              className={`${styles.rij} ${geselecteerd === m.id ? styles.rijActief : ''}`}
              onClick={() => setGeselecteerd(m.id)}
              data-prio={m.prioriteit}
            >
              <span className={styles.prioBalk} data-prio={m.prioriteit} aria-hidden />
              <span className={styles.avatar}>{initialen(m.afzender_naam, m.afzender_email)}</span>
              <span className={styles.rijMidden}>
                <span className={styles.rijTop}>
                  <span className={styles.afzender}>{m.afzender_naam || m.afzender_email || 'Onbekend'}</span>
                  <span className={styles.tijd}>{relatieveTijd(m.ontvangen_op)}</span>
                </span>
                <span className={styles.onderwerp}>{m.onderwerp || '(geen onderwerp)'}</span>
                <span className={styles.preview}>{m.body_preview?.slice(0, 120) || ''}</span>
                {(m.categorie || m.kenteken) && (
                  <span className={styles.badges}>
                    {m.categorie && <span className={styles.badge}>{m.categorie}</span>}
                    {m.kenteken && <span className={`${styles.badge} ${styles.badgeKenteken}`}>{m.kenteken}</span>}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.detail}>
          {!actief ? (
            <div className={styles.detailLeeg}>
              <span className={styles.detailLeegIcoon}>📬</span>
              Selecteer een bericht om te lezen.
            </div>
          ) : (
            <article className={styles.bericht}>
              <div className={styles.berichtKop}>
                <h2 className={styles.berichtTitel}>{actief.onderwerp || '(geen onderwerp)'}</h2>
                <div className={styles.berichtMeta}>
                  <strong>{actief.afzender_naam || actief.afzender_email}</strong>
                  {actief.afzender_naam && actief.afzender_email && (
                    <span className={styles.muted}> · {actief.afzender_email}</span>
                  )}
                  <span className={styles.muted}>
                    {' · '}
                    {actief.ontvangen_op
                      ? new Date(actief.ontvangen_op).toLocaleString('nl-NL')
                      : ''}
                  </span>
                </div>
                <div className={styles.metaBadges}>
                  <span className={styles.badge} data-prio={actief.prioriteit}>
                    {PRIO_LABEL[actief.prioriteit] ?? actief.prioriteit}
                  </span>
                  {actief.categorie && <span className={styles.badge}>{actief.categorie}</span>}
                  {actief.kenteken && (
                    <span className={`${styles.badge} ${styles.badgeKenteken}`}>{actief.kenteken}</span>
                  )}
                  <span className={`${styles.badge} ${styles.badgeStatus}`}>{actief.status}</span>
                </div>
              </div>

              {actief.samenvatting && (
                <div className={styles.blok}>
                  <span className={styles.blokLabel}>Samenvatting (BREIN)</span>
                  <p>{actief.samenvatting}</p>
                </div>
              )}

              {actief.concept_antwoord && (
                <div className={`${styles.blok} ${styles.concept}`}>
                  <span className={styles.blokLabel}>Concept-antwoord</span>
                  <p>{actief.concept_antwoord}</p>
                </div>
              )}

              <div className={styles.blok}>
                <span className={styles.blokLabel}>Origineel bericht</span>
                {actief.body_html ? (
                  <iframe
                    title="mail-inhoud"
                    className={styles.mailFrame}
                    sandbox=""
                    srcDoc={actief.body_html}
                  />
                ) : (
                  <p className={styles.muted}>{actief.body_preview}</p>
                )}
              </div>

              <div className={styles.acties}>
                {actief.status !== 'overgeslagen' && (
                  <button
                    className={styles.actieKnop}
                    onClick={() => void setStatus(actief.id, 'overgeslagen')}
                  >
                    Negeren
                  </button>
                )}
                {actief.status === 'overgeslagen' && (
                  <button
                    className={styles.actieKnop}
                    onClick={() => void setStatus(actief.id, 'nieuw')}
                  >
                    Terug naar nieuw
                  </button>
                )}
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
