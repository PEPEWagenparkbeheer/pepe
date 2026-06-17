'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Tender, TenderResult, LeasePortaal } from '@/lib/types/tender';
import { PORTALEN } from '@/lib/types/tender';
import { authHeaders } from '@/lib/clientAuth';
import styles from './TenderResultaat.module.css';

export default function TenderResultaat({ tenderId }: { tenderId: string }) {
  const [tender, setTender] = useState<Tender | null>(null);
  const [results, setResults] = useState<TenderResult[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let actief = true;

    async function laad() {
      const [tRes, rRes] = await Promise.all([
        supabase.from('tenders').select('*').eq('id', tenderId).single(),
        supabase.from('tender_results').select('*').eq('tender_id', tenderId).order('portaal'),
      ]);
      if (!actief) return;
      setTender((tRes.data as Tender) ?? null);
      setResults((rRes.data as TenderResult[]) ?? []);
      setLaden(false);
    }
    laad();

    // Realtime updates
    const ch = supabase
      .channel(`tender_${tenderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tender_results', filter: `tender_id=eq.${tenderId}` }, () => laad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenders', filter: `id=eq.${tenderId}` }, () => laad())
      .subscribe();

    return () => {
      actief = false;
      supabase.removeChannel(ch);
    };
  }, [tenderId]);

  // Skyvern-runs duren 10-40 min — langer dan een serverless functie mag draaien.
  // Zolang de tender loopt, vraagt deze poll de run-status op; de poll-route
  // schrijft resultaten naar Supabase en realtime werkt de UI dan bij.
  const tenderStatus = tender?.status;
  useEffect(() => {
    if (tenderStatus !== 'running') return;
    const poll = () => {
      void (async () => {
        await fetch(`/api/tender/poll?tender_id=${tenderId}`, { headers: await authHeaders() });
      })().catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [tenderStatus, tenderId]);

  if (laden) {
    return <div className={styles.pagina}><div className={styles.laden}>Laden…</div></div>;
  }
  if (!tender) {
    return (
      <div className={styles.pagina}>
        <div className={styles.kop}>
          <Link href="/lab/tender" className={styles.terug}>← Terug naar lab</Link>
          <h1 className={styles.titel}>Tender niet gevonden</h1>
        </div>
      </div>
    );
  }

  const auto = tender.parsed_data;
  const resultsByPortaal = new Map(results.map((r) => [r.portaal, r]));

  // Gemiddelde + verschillen voor analyse
  const prijzen = results.filter((r) => r.status === 'completed' && typeof r.maandprijs === 'number');
  const gemiddelde = prijzen.length > 0 ? prijzen.reduce((s, r) => s + r.maandprijs!, 0) / prijzen.length : null;
  const laagste = prijzen.length > 0 ? Math.min(...prijzen.map((r) => r.maandprijs!)) : null;

  return (
    <div className={styles.pagina}>
      <div className={styles.kop}>
        <Link href="/lab/tender" className={styles.terug}>← Terug naar lab</Link>
        <div className={styles.labBadge}>LAB</div>
        <h1 className={styles.titel}>
          {auto?.merk} {auto?.model}
        </h1>
        <p className={styles.sub}>
          Klant: <strong>{tender.klant_naam}</strong>
          {auto?.looptijd && <> · {auto.looptijd} mnd · {auto.km_jaar?.toLocaleString('nl-NL')} km/jaar</>}
          {tender.status && <span className={styles.statusBadge}>Status: {tender.status}</span>}
        </p>
      </div>

      {/* Vergelijkingstabel */}
      <div className={styles.card}>
        <div className={styles.cardTitel}>Vergelijking per portaal</div>
        <div className={styles.tabelWrap}>
          <table className={styles.tabel}>
            <thead>
              <tr>
                <th>Portaal</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Maandprijs</th>
                <th style={{ textAlign: 'right' }}>Δ t.o.v. laagste</th>
                <th style={{ textAlign: 'right' }}>Duur</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {PORTALEN.map(({ key, label }) => {
                const r = resultsByPortaal.get(key as LeasePortaal);
                return <PortaalRij key={key} label={label} result={r} laagste={laagste} />;
              })}
            </tbody>
          </table>
        </div>

        {gemiddelde !== null && (
          <div className={styles.samenvatting}>
            <div className={styles.statBlok}>
              <div className={styles.statLabel}>Laagste</div>
              <div className={styles.statValGroot}>€ {fmtEuro(laagste!)}</div>
            </div>
            <div className={styles.statBlok}>
              <div className={styles.statLabel}>Gemiddeld</div>
              <div className={styles.statVal}>€ {fmtEuro(gemiddelde)}</div>
            </div>
            <div className={styles.statBlok}>
              <div className={styles.statLabel}>Aantal voltooid</div>
              <div className={styles.statVal}>{prijzen.length} / {results.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Eventuele errors */}
      {results.filter((r) => r.status === 'failed').length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitel}>Fouten</div>
          {results.filter((r) => r.status === 'failed').map((r) => (
            <div key={r.id} className={styles.errBlok}>
              <strong>{r.portaal}</strong>: {r.error_message ?? 'Onbekende fout'}
            </div>
          ))}
        </div>
      )}

      {/* Configuratie samenvatting (collapsable) */}
      <details className={styles.details}>
        <summary>Aanvraag-data (Groq output)</summary>
        <pre className={styles.json}>{JSON.stringify(auto, null, 2)}</pre>
      </details>
    </div>
  );
}

function PortaalRij({ label, result, laagste }: {
  label: string;
  result?: TenderResult;
  laagste: number | null;
}) {
  if (!result) {
    return (
      <tr className={styles.rijIdle}>
        <td>{label}</td>
        <td colSpan={5} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Niet bevraagd</td>
      </tr>
    );
  }

  const duurMs = result.started_at && result.finished_at
    ? new Date(result.finished_at).getTime() - new Date(result.started_at).getTime()
    : null;

  const delta = laagste !== null && typeof result.maandprijs === 'number'
    ? result.maandprijs - laagste
    : null;

  return (
    <tr>
      <td><strong>{label}</strong></td>
      <td><StatusBadge status={result.status} /></td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {typeof result.maandprijs === 'number'
          ? <strong>€ {fmtEuro(result.maandprijs)}</strong>
          : <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {delta !== null ? (
          delta === 0
            ? <span className={styles.beste}>laagste</span>
            : <span className={styles.delta}>+ € {fmtEuro(delta)}</span>
        ) : '—'}
      </td>
      <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
        {duurMs ? `${(duurMs / 1000).toFixed(0)}s` : '—'}
      </td>
      <td>
        {result.pdf_url
          ? <a href={result.pdf_url} target="_blank" rel="noopener noreferrer">⬇</a>
          : <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed' ? styles.statusOk
            : status === 'failed' ? styles.statusErr
            : status === 'running' ? styles.statusRun
            : styles.statusPend;
  const label = status === 'completed' ? '✓ Klaar'
              : status === 'failed' ? '✕ Fout'
              : status === 'running' ? '◌ Bezig'
              : 'Wacht';
  return <span className={`${styles.status} ${cls}`}>{label}</span>;
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
