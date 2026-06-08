'use client';

import { useState } from 'react';
import { useBrein, type BreinBericht, type BreinStatus } from '@/hooks/useBrein';
import styles from './BreinPage.module.css';

type Tab = 'nieuw' | 'opgepakt' | 'in_behandeling' | 'afgehandeld' | 'alle';

const TAB_LABELS: Record<Tab, string> = {
  nieuw:          'Nieuw',
  opgepakt:       'Opgepakt',
  in_behandeling: 'In behandeling',
  afgehandeld:    'Afgehandeld',
  alle:           'Alle',
};

const STATUS_LABELS: Record<BreinStatus, string> = {
  nieuw:          'Nieuw',
  opgepakt:       'Opgepakt',
  in_behandeling: 'In behandeling',
  afgehandeld:    'Afgehandeld',
  overgeslagen:   'Overgeslagen',
};

function datumFmt(d: string) {
  try {
    const dt = new Date(d);
    const nu = new Date();
    const gisteren = new Date(nu); gisteren.setDate(nu.getDate() - 1);
    if (dt.toDateString() === nu.toDateString()) {
      return dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    }
    if (dt.toDateString() === gisteren.toDateString()) return 'Gisteren';
    return dt.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  } catch { return d; }
}

function datumLang(d: string) {
  try {
    return new Date(d).toLocaleString('nl-NL', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
}

function StatusBadge({ status }: { status: BreinStatus }) {
  const cls: Record<BreinStatus, string> = {
    nieuw:          styles.stNieuw,
    opgepakt:       styles.stOppepakt,
    in_behandeling: styles.stBehandeling,
    afgehandeld:    styles.stAfgehandeld,
    overgeslagen:   styles.stOvergeslagen,
  };
  return <span className={cls[status]}>{STATUS_LABELS[status]}</span>;
}

function PrioDot({ prio }: { prio: BreinBericht['prioriteit'] }) {
  if (prio === 'laag' || prio === 'normaal') return <span className={styles.prioNormaal} title={prio} />;
  if (prio === 'hoog') return <span className={styles.prioHoog} title="Hoog" />;
  return <span className={styles.prioUrgent} title="Urgent" />;
}

// ── KPI strip ──────────────────────────────────────────────────────────────
function KpiStrip({ berichten }: { berichten: BreinBericht[] }) {
  const vandaag = new Date().toDateString();
  const nieuw         = berichten.filter((b) => b.status === 'nieuw').length;
  const inBeh         = berichten.filter((b) => b.status === 'in_behandeling' || b.status === 'opgepakt').length;
  const afgehandeld   = berichten.filter((b) => b.status === 'afgehandeld' && new Date(b.updated_at).toDateString() === vandaag).length;
  const urgent        = berichten.filter((b) => b.prioriteit === 'urgent' && b.status === 'nieuw').length;

  return (
    <div className={styles.kpiStrip}>
      <div className={styles.kpiKaart}>
        <div className={styles.kpiLabel}>Nieuw</div>
        <div className={`${styles.kpiWaarde} ${nieuw > 0 ? styles.kpiWaardeAccent : ''}`}>{nieuw}</div>
      </div>
      <div className={styles.kpiKaart}>
        <div className={styles.kpiLabel}>In behandeling</div>
        <div className={styles.kpiWaarde}>{inBeh}</div>
      </div>
      <div className={styles.kpiKaart}>
        <div className={styles.kpiLabel}>Afgehandeld vandaag</div>
        <div className={styles.kpiWaarde}>{afgehandeld}</div>
      </div>
      <div className={styles.kpiKaart}>
        <div className={styles.kpiLabel}>Urgent</div>
        <div className={`${styles.kpiWaarde} ${urgent > 0 ? styles.kpiWaardeAccent : ''}`}>{urgent}</div>
      </div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────
function DetailPanel({ bericht, onStatusChange }: { bericht: BreinBericht | null; onStatusChange: (id: string, s: BreinStatus) => void }) {
  if (!bericht) {
    return (
      <div className={`${styles.detail} ${styles.geenSelectie}`}>
        <span className={styles.geenSelectieEmoji}>🧠</span>
        <span>Selecteer een bericht</span>
      </div>
    );
  }

  const acties: { label: string; status: BreinStatus }[] = [
    { label: 'Oppakken', status: 'opgepakt' },
    { label: 'In behandeling', status: 'in_behandeling' },
    { label: 'Afgehandeld', status: 'afgehandeld' },
    { label: 'Overslaan', status: 'overgeslagen' },
  ];

  return (
    <div className={styles.detail}>
      <div className={styles.detailKop}>
        <div className={styles.detailOnderwerp}>{bericht.onderwerp}</div>
        <div className={styles.detailMeta}>
          <span className={styles.detailAfzender}>
            {bericht.afzender_naam ? `${bericht.afzender_naam} <${bericht.afzender_email}>` : bericht.afzender_email}
          </span>
          <span className={styles.detailDatum}>{datumLang(bericht.ontvangen_op)}</span>
          <StatusBadge status={bericht.status} />
        </div>
        {bericht.kenteken && (
          <div className={styles.detailMeta}>
            <span className={styles.detailAfzender}>🚗 Kenteken: <strong>{bericht.kenteken}</strong></span>
          </div>
        )}
      </div>

      <div className={styles.detailActies}>
        {acties
          .filter((a) => a.status !== bericht.status)
          .map((a) => (
            <button
              key={a.status}
              className={`${styles.actieBtn} ${a.status === 'afgehandeld' ? styles.actieBtnPrimair : ''}`}
              onClick={() => onStatusChange(bericht.id, a.status)}
            >
              {a.label}
            </button>
          ))}
      </div>

      {bericht.samenvatting && (
        <div className={styles.samenvatting}>
          <div className={styles.samenvattingLabel}>🤖 AI-samenvatting</div>
          {bericht.samenvatting}
        </div>
      )}

      <div
        className={styles.detailBody}
        dangerouslySetInnerHTML={
          bericht.body_html
            ? { __html: bericht.body_html }
            : { __html: `<pre style="white-space:pre-wrap">${bericht.body_preview ?? ''}</pre>` }
        }
      />
    </div>
  );
}

// ── Hoofd component ────────────────────────────────────────────────────────
export default function BreinPage() {
  const { berichten, loading, syncing, setStatus, sync } = useBrein();
  const [tab, setTab] = useState<Tab>('nieuw');
  const [zoek, setZoek] = useState('');
  const [geselecteerd, setGeselecteerd] = useState<BreinBericht | null>(null);
  const [syncFeedback, setSyncFeedback] = useState('');

  const gefilterd = berichten.filter((b) => {
    const tabMatch = tab === 'alle' || b.status === tab;
    const zoekMatch = !zoek || [b.onderwerp, b.afzender_email, b.afzender_naam ?? '', b.body_preview ?? '']
      .join(' ').toLowerCase().includes(zoek.toLowerCase());
    return tabMatch && zoekMatch;
  });

  function teller(t: Tab) {
    if (t === 'alle') return berichten.length;
    return berichten.filter((b) => b.status === t).length;
  }

  async function handleSync() {
    setSyncFeedback('');
    try {
      const result = await sync();
      setSyncFeedback(result.synced > 0 ? `${result.synced} nieuw` : 'Up-to-date');
      setTimeout(() => setSyncFeedback(''), 3000);
    } catch {
      setSyncFeedback('Fout');
      setTimeout(() => setSyncFeedback(''), 3000);
    }
  }

  async function handleStatusChange(id: string, status: BreinStatus) {
    await setStatus(id, status);
    if (geselecteerd?.id === id) {
      setGeselecteerd((prev) => prev ? { ...prev, status } : null);
    }
  }

  const TABS: Tab[] = ['nieuw', 'opgepakt', 'in_behandeling', 'afgehandeld', 'alle'];

  return (
    <div className={styles.pagina}>
      {/* Tab balk */}
      <div className={styles.tabBalk}>
        {TABS.map((t) => {
          const count = teller(t);
          return (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActief : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
              {count > 0 && (
                <span className={`${styles.badge} ${t !== 'nieuw' && t !== tab ? styles.badgeGrijs : ''}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div className={styles.tabBalkRechts}>
          <input
            className={styles.zoekbalk}
            placeholder="Zoeken..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
          <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? '⟳ Ophalen…' : '⟳ Sync'}
            {syncFeedback && <span>{syncFeedback}</span>}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {!loading && <KpiStrip berichten={berichten} />}

      {/* Content */}
      <div className={styles.content}>
        {/* Berichtenlijst */}
        <div className={styles.lijst}>
          {loading ? (
            <div className={styles.lege}>
              <span className={styles.legeEmoji}>⌛</span>
              <span className={styles.legeTekst}>Laden…</span>
            </div>
          ) : gefilterd.length === 0 ? (
            <div className={styles.lege}>
              <span className={styles.legeEmoji}>📭</span>
              <span className={styles.legeTekst}>Geen berichten</span>
            </div>
          ) : (
            gefilterd.map((b) => (
              <div
                key={b.id}
                className={[
                  styles.berichtRij,
                  geselecteerd?.id === b.id ? styles.berichtRijActief : '',
                  b.status === 'nieuw' ? styles.berichtRijNieuw : '',
                ].join(' ')}
                onClick={() => setGeselecteerd(b)}
              >
                <div className={styles.rijKop}>
                  <PrioDot prio={b.prioriteit} />
                  <span className={styles.afzender}>{b.afzender_naam || b.afzender_email}</span>
                  <span className={styles.datum}>{datumFmt(b.ontvangen_op)}</span>
                </div>
                <div className={styles.onderwerp}>{b.onderwerp}</div>
                <div className={styles.preview}>{b.body_preview}</div>
                <div className={styles.rijMeta}>
                  <StatusBadge status={b.status} />
                  {b.kenteken && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🚗 {b.kenteken}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <DetailPanel bericht={geselecteerd} onStatusChange={handleStatusChange} />
      </div>
    </div>
  );
}