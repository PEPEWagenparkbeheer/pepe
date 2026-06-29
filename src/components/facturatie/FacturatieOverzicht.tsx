'use client';

import { type MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import type { UitgaandeFactuur, FactuurStatus, FactuurType } from '@/types/factuur';
import FactuurModal from './FactuurModal';
import styles from './Facturatie.module.css';

const STATUS_LABEL: Record<FactuurStatus, string> = {
  concept: 'Concept',
  aanvullen: 'Aanvullen',
  ter_controle: 'Ter controle',
  definitief: 'Definitief',
  verzonden: 'Verzonden',
  geannuleerd: 'Geannuleerd',
};

const TYPE_LABEL: Record<FactuurType, string> = {
  auto: 'Auto',
  wagenparkbeheer: 'Wagenparkbeheer',
  shortlease: 'Shortlease',
  werk_derden: 'Werk derden',
  diensten_overig: 'Diensten',
};

type TabKey = 'open' | 'historie' | FactuurStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'open', label: 'Te doen' },
  { key: 'ter_controle', label: 'Ter controle' },
  { key: 'concept', label: 'Concept' },
  { key: 'aanvullen', label: 'Aanvullen' },
  { key: 'historie', label: 'Historie' },
];

const HISTORIE_STATUSSEN = ['definitief', 'verzonden'];

function euro(n?: number) {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)}`;
}

export default function FacturatieOverzicht() {
  const [facturen, setFacturen] = useState<UitgaandeFactuur[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('open');
  const [actief, setActief] = useState<UitgaandeFactuur | null>(null);
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [geenToegang, setGeenToegang] = useState(false);

  const laad = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/uitgaande-facturen', { headers: await authHeaders() });
    if (res.status === 403) { setGeenToegang(true); setLoading(false); return; }
    const json = await res.json().catch(() => ({}));
    setFacturen(Array.isArray(json.facturen) ? json.facturen : []);
    setLoading(false);
  }, []);

  useEffect(() => { void laad(); }, [laad]);

  const [syncStatus, setSyncStatus] = useState('');
  async function syncDebiteuren() {
    if (!confirm('Twinfield-debiteuren synchroniseren naar de zoek-index? De eerste keer kan dit enkele minuten duren.')) return;
    let resterend = 1; let totaal = 0; let ronde = 0;
    setSyncStatus('Synchroniseren…');
    while (resterend > 0 && ronde < 300) {
      const res = await fetch('/api/uitgaande-facturen/debiteuren-sync', { method: 'POST', headers: await authHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setSyncStatus(''); alert(j.error ?? 'Sync mislukt'); return; }
      totaal = j.totaal ?? totaal; resterend = j.resterend ?? 0; ronde++;
      setSyncStatus(`Adressen ophalen… nog ${resterend} van ${totaal}`);
    }
    setSyncStatus('');
    alert(`Klaar — ${totaal} Twinfield-debiteuren in de zoek-index (incl. postcode/huisnummer).`);
  }

  async function genereerShortlease() {
    if (!confirm('Shortlease-concepten voor deze maand klaarzetten?')) return;
    const res = await fetch('/api/facturatie/shortlease-cron', { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const r = (j.resultaat ?? []).map((x: { company: string; status: string; regels?: number }) => `${x.company}: ${x.status}${x.regels ? ` (${x.regels})` : ''}`).join(' · ');
      await laad(); setTab('ter_controle');
      alert(`Periode ${j.periode} — ${j.gevonden_deals} shortlease-deals.\n${r || 'Niets klaargezet.'}`);
    } else alert(j.error ?? 'Mislukt');
  }

  async function importDocusign() {
    const env = window.prompt('DocuSign Envelope-ID van de getekende offerte:');
    if (!env) return;
    const res = await fetch('/api/uitgaande-facturen/docusign-import', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ envelopeId: env.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { await laad(); setTab('open'); alert(j.bestond ? 'Was al geïmporteerd.' : 'Geïmporteerd — staat onder “Aanvullen”.'); }
    else alert(j.error ?? 'Import mislukt');
  }

  const zichtbaar = useMemo(() => {
    if (tab === 'open') {
      return facturen.filter((f) => ['concept', 'aanvullen', 'ter_controle'].includes(f.status));
    }
    if (tab === 'historie') {
      return facturen.filter((f) => HISTORIE_STATUSSEN.includes(f.status));
    }
    return facturen.filter((f) => f.status === tab);
  }, [facturen, tab]);

  async function openPdf(e: MouseEvent, id: string) {
    e.stopPropagation();
    const res = await fetch(`/api/uitgaande-facturen/${id}/pdf`, { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) window.open(j.url, '_blank');
    else alert(j.error ?? 'Geen PDF beschikbaar');
  }

  async function opnieuwVerzenden(e: MouseEvent, f: UitgaandeFactuur) {
    e.stopPropagation();
    const huidig = f.verzonden_naar || f.factuur_email || f.email || '';
    const to = window.prompt('Factuur (opnieuw) versturen naar e-mailadres:', huidig);
    if (!to) return;
    const res = await fetch(`/api/uitgaande-facturen/${f.id}/verzend`, {
      method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ to }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { await laad(); alert(`Factuur opnieuw verstuurd naar ${to}.`); }
    else alert(j.error ?? 'Versturen mislukt');
  }

  async function crediteer(e: MouseEvent, f: UitgaandeFactuur) {
    e.stopPropagation();
    const pin = window.prompt(`Pincode om factuur ${f.factuurnummer ?? ''} te crediteren:`);
    if (!pin) return;
    const res = await fetch(`/api/uitgaande-facturen/${f.id}/crediteer`, {
      method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ pin }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { await laad(); setActief(j.factuur); }
    else alert(j.error ?? 'Crediteren mislukt');
  }

  if (geenToegang) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Facturatie</h1>
        <p className={styles.empty}>Je hebt geen toegang tot de Facturatie-module. Vraag Joep om toegang.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Facturatie</h1>
          <p className={styles.sub}>Uitgaande facturen — auto&apos;s &amp; diensten · gekoppeld aan Twinfield</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className={styles.secondary} href="/facturatie/wagenparkbeheer">Wagenparkbeheer-config</Link>
          <button className={styles.secondary} onClick={syncDebiteuren}>{syncStatus || 'Sync debiteuren'}</button>
          <button className={styles.secondary} onClick={genereerShortlease}>Shortlease nu</button>
          <button className={styles.secondary} onClick={importDocusign}>Importeer DocuSign</button>
          <button className={styles.primary} onClick={() => setNieuwOpen(true)}>+ Nieuwe factuur</button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((t) => {
          const count = t.key === 'open'
            ? facturen.filter((f) => ['concept', 'aanvullen', 'ter_controle'].includes(f.status)).length
            : t.key === 'historie'
            ? facturen.filter((f) => HISTORIE_STATUSSEN.includes(f.status)).length
            : facturen.filter((f) => f.status === t.key).length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}{count > 0 && <span className={styles.badge}>{count}</span>}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <p className={styles.empty}>Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p className={styles.empty}>Geen facturen in deze weergave.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th><th>Status</th><th>Klant</th><th>Nummer</th>
              <th>Datum</th><th className={styles.right}>Totaal</th>
              {tab === 'historie' && <th className={styles.right}>Acties</th>}
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map((f) => (
              <tr key={f.id} className={styles.row} onClick={() => setActief(f)}>
                <td>
                  <span className={styles.typeChip}>{TYPE_LABEL[f.type]}</span>
                  {f.soort === 'creditnota' && <span className={styles.credit}>credit</span>}
                </td>
                <td><span className={styles.statusChip} data-status={f.status}>{STATUS_LABEL[f.status]}</span></td>
                <td>
                  {f.klant_naam || '—'}
                  {tab === 'historie' && f.verzonden_naar && (
                    <span style={{ display: 'block', fontSize: 11, color: '#8b8e93' }}>→ {f.verzonden_naar}</span>
                  )}
                </td>
                <td>{f.factuurnummer || '—'}</td>
                <td>{f.factuurdatum ? new Date(f.factuurdatum).toLocaleDateString('nl-NL') : '—'}</td>
                <td className={styles.right}>{euro(f.totaal_incl)}</td>
                {tab === 'historie' && (
                  <td className={styles.right} onClick={(e) => e.stopPropagation()}>
                    <button className={styles.mini} onClick={(e) => openPdf(e, f.id)}>PDF</button>
                    <button className={styles.mini} style={{ marginLeft: 6 }} onClick={(e) => opnieuwVerzenden(e, f)}>Mail opnieuw</button>
                    {f.soort !== 'creditnota' && (
                      <button className={styles.mini} style={{ marginLeft: 6 }} onClick={(e) => crediteer(e, f)}>Crediteer</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(actief || nieuwOpen) && (
        <FactuurModal
          factuur={actief}
          onClose={() => { setActief(null); setNieuwOpen(false); }}
          onSaved={async () => { await laad(); }}
        />
      )}
    </div>
  );
}
