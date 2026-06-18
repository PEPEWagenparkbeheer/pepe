'use client';

import { useEffect, useMemo, useState } from 'react';
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

const STATUS_LABEL: Record<BreinStatus, string> = {
  nieuw: 'Nieuw',
  opgepakt: 'Opgepakt',
  in_behandeling: 'In behandeling',
  afgehandeld: 'Afgehandeld',
  overgeslagen: 'Overgeslagen',
  verzonden: 'Verzonden',
};

// Werkstroom-acties in volgorde; de huidige status wordt eruit gefilterd.
const STATUS_ACTIES: { label: string; status: BreinStatus }[] = [
  { label: 'Oppakken', status: 'opgepakt' },
  { label: 'In behandeling', status: 'in_behandeling' },
  { label: 'Afgehandeld', status: 'afgehandeld' },
  { label: 'Negeren', status: 'overgeslagen' },
];

function tijdLang(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

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
  const { messages, loading, error, refresh, sync, setStatus, classify, genereerConcept, saveConcept, verstuur } =
    useBreinMessages();
  const [classifying, setClassifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<BreinStatus | 'alle'>('nieuw');
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [conceptDraft, setConceptDraft] = useState('');

  async function handleSync() {
    setSyncing(true);
    try {
      await sync();
    } catch (e) {
      alert('Ophalen mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncing(false);
    }
  }

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

  async function handleClassify() {
    setClassifying(true);
    try {
      await classify();
    } finally {
      setClassifying(false);
    }
  }

  // Houd het bewerkbare concept-veld in sync met het geselecteerde bericht.
  useEffect(() => {
    setConceptDraft(actief?.concept_antwoord ?? '');
  }, [actief?.id, actief?.concept_antwoord]);

  async function handleGenereer() {
    if (!actief) return;
    setGenerating(true);
    try {
      const c = await genereerConcept(actief.id);
      setConceptDraft(c);
    } catch (e) {
      alert('Concept genereren mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  }

  async function handleVerstuur() {
    if (!actief) return;
    const naar = actief.afzender_naam || actief.afzender_email || 'de afzender';
    if (conceptDraft !== (actief.concept_antwoord ?? '')) {
      await saveConcept(actief.id, conceptDraft);
    }
    if (!confirm(`Dit concept nu versturen naar ${naar}?\n\nDe officiële handtekening wordt automatisch toegevoegd.`)) {
      return;
    }
    setSending(true);
    try {
      await verstuur(actief.id);
    } catch (e) {
      alert('Versturen mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

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
        <button className={styles.vernieuwKnop} onClick={() => void handleSync()} disabled={syncing}>
          {syncing ? 'Ophalen…' : '📥 Ophalen'}
        </button>
        <button className={styles.vernieuwKnop} onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Laden…' : '↻ Vernieuwen'}
        </button>
        <button className={styles.vernieuwKnop} onClick={() => void handleClassify()} disabled={loading || classifying}>
          {classifying ? 'Classificeren…' : '🧠 Classificeer'}
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
              className={`${styles.rij} ${geselecteerd === m.id ? styles.rijActief : ''} ${!m.is_read ? styles.rijOngelezen : ''}`}
              onClick={() => setGeselecteerd(m.id)}
              data-prio={m.prioriteit}
            >
              <span className={styles.prioBalk} data-prio={m.prioriteit} aria-hidden />
              <span className={styles.avatar}>{initialen(m.afzender_naam, m.afzender_email)}</span>
              <span className={styles.rijMidden}>
                <span className={styles.rijTop}>
                  {!m.is_read && <span className={styles.ongelezenStip} title="Ongelezen in Outlook" />}
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
                  <span className={`${styles.badge} ${styles.badgeStatus}`}>
                    {STATUS_LABEL[actief.status] ?? actief.status}
                  </span>
                  {actief.behandeld_door && (
                    <span className={styles.muted}>· door {actief.behandeld_door}</span>
                  )}
                </div>
              </div>

              {actief.samenvatting && (
                <div className={styles.blok}>
                  <span className={styles.blokLabel}>Samenvatting (BREIN)</span>
                  <p>{actief.samenvatting}</p>
                </div>
              )}

              <div className={`${styles.blok} ${styles.concept}`}>
                <div className={styles.conceptKop}>
                  <span className={styles.blokLabel}>Concept-antwoord</span>
                  <div className={styles.conceptActies}>
                    <button
                      className={styles.miniKnop}
                      onClick={() => void handleGenereer()}
                      disabled={generating}
                    >
                      {generating ? 'Genereren…' : actief.concept_antwoord ? '↻ Opnieuw' : '✨ Genereer concept'}
                    </button>
                    {conceptDraft.trim() !== '' && (
                      <button
                        className={`${styles.miniKnop} ${styles.miniKnopPrimair}`}
                        onClick={() => void saveConcept(actief.id, conceptDraft)}
                        disabled={conceptDraft === (actief.concept_antwoord ?? '')}
                        title={conceptDraft === (actief.concept_antwoord ?? '') ? 'Al opgeslagen' : 'Wijziging opslaan'}
                      >
                        {conceptDraft === (actief.concept_antwoord ?? '') ? '✓ Opgeslagen' : 'Opslaan'}
                      </button>
                    )}
                    {conceptDraft.trim() !== '' && actief.status !== 'verzonden' && (
                      <button
                        className={`${styles.miniKnop} ${styles.miniKnopVerstuur}`}
                        onClick={() => void handleVerstuur()}
                        disabled={sending}
                      >
                        {sending ? 'Versturen…' : '📨 Versturen'}
                      </button>
                    )}
                    {actief.status === 'verzonden' && (
                      <span className={styles.verzondenLabel}>
                        ✓ Verzonden{actief.verzonden_op ? ' ' + new Date(actief.verzonden_op).toLocaleString('nl-NL') : ''}
                      </span>
                    )}
                  </div>
                </div>
                {actief.concept_antwoord || conceptDraft ? (
                  <textarea
                    className={styles.conceptVeld}
                    value={conceptDraft}
                    onChange={(e) => setConceptDraft(e.target.value)}
                    rows={10}
                  />
                ) : (
                  <p className={styles.muted}>
                    Nog geen concept. Klik op "Genereer concept" om Claude een antwoord te laten opstellen in
                    de stijl van fues@.
                  </p>
                )}
              </div>

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

              {actief.historie?.length > 0 && (
                <div className={styles.blok}>
                  <span className={styles.blokLabel}>Historie</span>
                  <ul className={styles.historie}>
                    {actief.historie.map((h, i) => (
                      <li key={i}>
                        <strong>{STATUS_LABEL[h.status] ?? h.status}</strong>
                        {' · '}door {h.door}
                        {' · '}
                        <span className={styles.muted}>{tijdLang(h.op)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.acties}>
                {STATUS_ACTIES.filter((a) => a.status !== actief.status).map((a) => (
                  <button
                    key={a.status}
                    className={`${styles.actieKnop} ${a.status === 'afgehandeld' ? styles.actieKnopPrimair : ''}`}
                    onClick={() => void setStatus(actief.id, a.status)}
                  >
                    {a.label}
                  </button>
                ))}
                {actief.status !== 'nieuw' && (
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

