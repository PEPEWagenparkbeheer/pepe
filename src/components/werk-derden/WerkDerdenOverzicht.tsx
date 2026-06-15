'use client';

import { useState } from 'react';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import type { WerkDerdenRecord } from '@/types';
import styles from './WerkDerdenOverzicht.module.css';

type Tab = 'open' | 'goedgekeurd' | 'gefactureerd' | 'afgekeurd';

function euroFmt(n?: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}

function datumFmt(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// --- GoedkeurenDialog --------------------------------------------------------

interface GoedkeurenDialogProps {
  record: WerkDerdenRecord;
  onBevestigen: () => Promise<void>;
  onSluiten: () => void;
}

function GoedkeurenDialog({ record, onBevestigen, onSluiten }: GoedkeurenDialogProps) {
  const [bezig, setBezig] = useState(false);
  const voertuig = record.kenteken ?? record.meldcode ?? '—';
  const merk = [record.merk, record.model].filter(Boolean).join(' ') || null;

  async function handlerKlik() {
    setBezig(true);
    try { await onBevestigen(); } finally { setBezig(false); }
  }

  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.dialogTitel}>Werkzaamheden goedkeuren</h2>
        <div className={styles.dialogInfo}>
          <div className={styles.dialogRij}><span>Voertuig</span>{voertuig}{merk ? ` — ${merk}` : ''}</div>
          <div className={styles.dialogRij}><span>Partner</span>{record.partner}</div>
          <div className={styles.dialogRij}><span>Klant</span>{record.klant ?? '—'}</div>
          <div className={styles.dialogRij}><span>Inkoop</span>{euroFmt(record.inkoop_bedrag)}</div>
        </div>
        <div className={styles.dialogKnoppen}>
          <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
          <button className={styles.bevestigenKnop} onClick={handlerKlik} disabled={bezig}>
            {bezig ? 'Verwerken…' : '✓ Goedkeuren'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- AfkeurenDialog ----------------------------------------------------------

interface AfkeurenDialogProps {
  record: WerkDerdenRecord;
  onBevestigen: (reden: string) => Promise<void>;
  onSluiten: () => void;
}

function AfkeurenDialog({ record, onBevestigen, onSluiten }: AfkeurenDialogProps) {
  const [reden, setReden] = useState('');
  const [bezig, setBezig] = useState(false);
  const voertuig = record.kenteken ?? record.meldcode ?? '—';

  async function handlerKlik() {
    if (!reden.trim()) return;
    setBezig(true);
    try { await onBevestigen(reden.trim()); } finally { setBezig(false); }
  }

  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.dialogTitel}>Werkzaamheden afkeuren</h2>
        <div className={styles.dialogInfo}>
          <div className={styles.dialogRij}><span>Voertuig</span>{voertuig}</div>
          <div className={styles.dialogRij}><span>Partner</span>{record.partner}</div>
        </div>
        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Reden afkeuring</label>
          <textarea
            className={styles.dialogTextarea}
            rows={3}
            value={reden}
            onChange={e => setReden(e.target.value)}
            placeholder="Beschrijf de reden van afkeuring…"
            autoFocus
          />
        </div>
        <div className={styles.dialogKnoppen}>
          <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
          <button className={styles.bevestigenKnop} onClick={handlerKlik} disabled={bezig || !reden.trim()}>
            {bezig ? 'Verwerken…' : 'Afkeuren'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- FacurerenDialog ---------------------------------------------------------

interface FacurerenDialogProps {
  record: WerkDerdenRecord;
  onBevestigen: (margeType: 'pct' | 'bedrag', margeWaarde: number) => Promise<void>;
  onSluiten: () => void;
}

function FacurerenDialog({ record, onBevestigen, onSluiten }: FacurerenDialogProps) {
  const inkoopTotaal = record.inkoop_bedrag ?? record.regels.reduce((s, r) => s + r.bedrag, 0);
  const [margeType, setMargeType] = useState<'pct' | 'bedrag'>(record.marge_type ?? 'pct');
  const [margeWaarde, setMargeWaarde] = useState<string>(
    record.marge_waarde != null ? String(record.marge_waarde) : '',
  );
  const [bezig, setBezig] = useState(false);

  const margeNum = parseFloat(margeWaarde.replace(',', '.'));
  const verkoopBerekend =
    isNaN(margeNum) || margeNum < 0
      ? null
      : margeType === 'pct'
        ? inkoopTotaal * (1 + margeNum / 100)
        : inkoopTotaal + margeNum;
  const margePositief = verkoopBerekend != null && verkoopBerekend >= inkoopTotaal;

  const voertuig = record.kenteken ?? record.meldcode ?? '—';
  const merk = [record.merk, record.model].filter(Boolean).join(' ') || null;

  async function handlerKlik() {
    if (verkoopBerekend == null || verkoopBerekend <= 0) return;
    setBezig(true);
    try { await onBevestigen(margeType, margeNum); } finally { setBezig(false); }
  }

  const toggleStyle = (active: boolean) => ({
    flex: 1,
    padding: '8px',
    borderRadius: 7,
    cursor: 'pointer' as const,
    fontWeight: 600,
    fontSize: 14,
    border: active ? '2px solid var(--accent)' : '1.5px solid var(--border)',
    background: active ? 'rgba(59,130,246,0.08)' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text)',
  });

  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.dialogTitel}>Factureren via Twinfield</h2>
        <div className={styles.dialogInfo}>
          <div className={styles.dialogRij}><span>Voertuig</span>{voertuig}{merk ? ` — ${merk}` : ''}</div>
          <div className={styles.dialogRij}><span>Partner</span>{record.partner}</div>
          <div className={styles.dialogRij}><span>Klant</span>{record.klant ?? '—'}</div>
          <div className={styles.dialogRij}><span>Inkoop</span>{euroFmt(inkoopTotaal)}</div>
          {record.goedgekeurd_op && (
            <div className={styles.dialogRij}><span>Goedgekeurd</span>{datumFmt(record.goedgekeurd_op)}</div>
          )}
        </div>

        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Marge type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setMargeType('pct')} style={toggleStyle(margeType === 'pct')}>
              Percentage (%)
            </button>
            <button type="button" onClick={() => setMargeType('bedrag')} style={toggleStyle(margeType === 'bedrag')}>
              Vaste marge (€)
            </button>
          </div>
        </div>

        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Marge {margeType === 'pct' ? '(%)' : '(€)'}</label>
          <div className={styles.bedragWrapper}>
            <span className={styles.euroPrefix}>{margeType === 'pct' ? '%' : '€'}</span>
            <input
              className={styles.bedragInput}
              type="number"
              min="0"
              step={margeType === 'pct' ? '0.1' : '1'}
              placeholder={margeType === 'pct' ? '15' : '250'}
              value={margeWaarde}
              onChange={e => setMargeWaarde(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {verkoopBerekend != null && (
          <div className={`${styles.margeInfo} ${margePositief ? styles.margePos : styles.margeNeg}`}>
            Verkoopbedrag: {euroFmt(verkoopBerekend)}
            {margeType === 'pct' && !isNaN(margeNum) && ` (+${margeNum}%)`}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div className={styles.dialogKnoppen}>
            <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
            <button
              className={styles.bevestigenKnop}
              onClick={handlerKlik}
              disabled={bezig || verkoopBerekend == null || verkoopBerekend <= 0}
            >
              {bezig ? 'Verwerken…' : 'Factureren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Hoofd component ---------------------------------------------------------

export default function WerkDerdenOverzicht() {
  const { records, loading, actieCount, setGoedgekeurd, setAfgekeurd, bijlageUrl } =
    useWerkDerden();
  const [tab, setTab] = useState<Tab>('open');
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

  const [goedkeurenRec, setGoedkeurenRec] = useState<WerkDerdenRecord | null>(null);
  const [afkeurenRec, setAfkeurenRec] = useState<WerkDerdenRecord | null>(null);
  const [factureerRec, setFactureerRec] = useState<WerkDerdenRecord | null>(null);

  function toonMelding(tekst: string, ok: boolean) {
    setMelding({ tekst, ok });
    setTimeout(() => setMelding(null), 4000);
  }

  const gefilterd = records.filter(r => r.status === tab);

  const tabLabels: Record<Tab, string> = {
    open: 'Open',
    goedgekeurd: 'Goedgekeurd',
    gefactureerd: 'Gefactureerd',
    afgekeurd: 'Afgekeurd',
  };

  async function openBijlage(rec: WerkDerdenRecord) {
    if (!rec.bijlage_storage_path) return;
    const url = await bijlageUrl(rec.bijlage_storage_path);
    if (url) window.open(url, '_blank');
  }

  async function handleGoedkeuren(rec: WerkDerdenRecord) {
    setGoedkeurenRec(null);
    setBezig(rec.id);
    try {
      await setGoedgekeurd(rec.id);
      toonMelding('Werkzaamheden goedgekeurd ✓', true);
    } catch {
      toonMelding('Fout bij goedkeuren', false);
    } finally {
      setBezig(null);
    }
  }

  async function handleAfkeuren(rec: WerkDerdenRecord, reden: string) {
    setAfkeurenRec(null);
    setBezig(rec.id);
    try {
      await setAfgekeurd(rec.id, reden);
      toonMelding('Werkzaamheden afgekeurd', true);
    } catch {
      toonMelding('Fout bij afkeuren', false);
    } finally {
      setBezig(null);
    }
  }

  async function handleFactureren(
    rec: WerkDerdenRecord,
    margeType: 'pct' | 'bedrag',
    margeWaarde: number,
  ) {
    setFactureerRec(null);
    setBezig(rec.id);
    try {
      const res = await fetch('/api/werk-derden/factureren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, marge_type: margeType, marge_waarde: margeWaarde }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        toonMelding(`Fout: ${(err as { error?: string }).error ?? 'factureren mislukt'}`, false);
      } else {
        toonMelding('Gefactureerd via Twinfield ✓', true);
      }
    } catch {
      toonMelding('Netwerkfout bij factureren', false);
    } finally {
      setBezig(null);
    }
  }

  async function exportXlsx() {
    const xlsx = await import('xlsx');
    const rows = records.map(rec => ({
      Datum: rec.created_at ? new Date(rec.created_at).toLocaleDateString('nl-NL') : '',
      Partner: rec.partner,
      Kenteken: rec.kenteken ?? rec.meldcode ?? '',
      'Merk/Model': [rec.merk, rec.model].filter(Boolean).join(' '),
      Klant: rec.klant ?? '',
      Omschrijving: rec.regels.map(r => `${r.omschrijving} (${euroFmt(r.bedrag)})`).join('; '),
      'Inkoop excl.BTW': rec.inkoop_bedrag ?? '',
      'Marge type': rec.marge_type ?? '',
      'Marge waarde': rec.marge_waarde ?? '',
      'Verkoop excl.BTW': rec.verkoop_bedrag ?? '',
      'BTW %': rec.btw_pct ?? 21,
      Status: rec.status,
      'Gefactureerd op': rec.gefactureerd_op ? new Date(rec.gefactureerd_op).toLocaleDateString('nl-NL') : '',
      'Twinfield ID': rec.twinfield_invoice_id ?? '',
    }));
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Werk derden');
    xlsx.writeFile(wb, `werk-derden-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (loading) return <div className={styles.laden}>Laden…</div>;

  return (
    <div className={styles.pagina}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.paginaTitel}>Werk Derden</h1>
          <p className={styles.paginaSub}>Ingediende werkzaamheden van partners</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {actieCount > 0 && (
            <span className={styles.openBadge}>{actieCount} te verwerken</span>
          )}
          <button className={styles.exportKnop} onClick={exportXlsx}>⬇ Excel</button>
        </div>
      </div>

      {melding && (
        <div className={`${styles.melding} ${melding.ok ? styles.meldingOk : styles.meldingFout}`}>
          {melding.tekst}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['open', 'goedgekeurd', 'gefactureerd', 'afgekeurd'] as Tab[]).map(t => {
          const count = records.filter(r => r.status === t).length;
          return (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActief : ''}`}
              onClick={() => setTab(t)}
            >
              {tabLabels[t]}
              {count > 0 && <span className={styles.tabBadge}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Tabel */}
      {gefilterd.length === 0 ? (
        <div className={styles.leeg}>Geen werkzaamheden in deze status.</div>
      ) : (
        <div className={styles.tabelWrapper}>
          <table className={styles.tabel}>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Voertuig</th>
                <th>Partner</th>
                <th>Regels</th>
                <th style={{ textAlign: 'right' }}>Inkoop</th>
                {tab === 'gefactureerd' && <th style={{ textAlign: 'right' }}>Verkoop</th>}
                <th>Bijlage</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map(rec => {
                const voertuig = rec.kenteken ?? rec.meldcode ?? '—';
                const merk = [rec.merk, rec.model].filter(Boolean).join(' ') || null;
                const isBusy = bezig === rec.id;

                return (
                  <tr key={rec.id} className={styles.rij}>
                    <td className={styles.datumKolom}>{datumFmt(rec.created_at)}</td>
                    <td>
                      <span className={styles.kenteken}>{voertuig}</span>
                      {merk && <span className={styles.klant}>{merk}</span>}
                      {rec.klant && <span className={styles.klant}>{rec.klant}</span>}
                    </td>
                    <td>{rec.partner}</td>
                    <td>
                      <div className={styles.regelLijst}>
                        {rec.regels.map((r, i) => (
                          <div key={i} className={styles.regelRij}>
                            <span className={styles.regelOmschrijving}>{r.omschrijving}</span>
                            <span className={styles.regelBedrag}>{euroFmt(r.bedrag)}</span>
                          </div>
                        ))}
                        {rec.notitie && <div className={styles.notitie}>{rec.notitie}</div>}
                      </div>
                    </td>
                    <td className={styles.bedragKolom}>
                      {euroFmt(rec.inkoop_bedrag)}
                      <span className={styles.btwInfo}>excl. {rec.btw_pct ?? 21}% btw</span>
                    </td>
                    {tab === 'gefactureerd' && (
                      <td className={styles.bedragKolom}>
                        {euroFmt(rec.verkoop_bedrag)}
                        {rec.gefactureerd_op && (
                          <span className={styles.btwInfo}>{datumFmt(rec.gefactureerd_op)}</span>
                        )}
                      </td>
                    )}
                    <td>
                      {rec.bijlage_storage_path ? (
                        <button className={styles.bijlageKnop} onClick={() => openBijlage(rec)}>
                          📎 Bijlage
                        </button>
                      ) : (
                        <span className={styles.geenBijlage}>—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actieKnoppen}>
                        {tab === 'open' && (
                          <>
                            <button
                              className={styles.facturerenKnop}
                              onClick={() => setGoedkeurenRec(rec)}
                              disabled={isBusy}
                            >
                              ✓ Goedkeuren
                            </button>
                            <button
                              className={styles.afkeurenKnop}
                              onClick={() => setAfkeurenRec(rec)}
                              disabled={isBusy}
                            >
                              ✗ Afkeuren
                            </button>
                          </>
                        )}
                        {tab === 'goedgekeurd' && (
                          <>
                            <button
                              className={styles.facturerenKnop}
                              onClick={() => setFactureerRec(rec)}
                              disabled={isBusy}
                            >
                              Factureren
                            </button>
                            <button
                              className={styles.afkeurenKnop}
                              onClick={() => setAfkeurenRec(rec)}
                              disabled={isBusy}
                            >
                              ✗ Afkeuren
                            </button>
                          </>
                        )}
                        {tab === 'gefactureerd' && rec.twinfield_invoice_id && (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            TW: {rec.twinfield_invoice_id}
                          </span>
                        )}
                        {tab === 'afgekeurd' && rec.afkeur_reden && (
                          <span className={styles.afkeurReden}>{rec.afkeur_reden}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {goedkeurenRec && (
        <GoedkeurenDialog
          record={goedkeurenRec}
          onBevestigen={() => handleGoedkeuren(goedkeurenRec)}
          onSluiten={() => setGoedkeurenRec(null)}
        />
      )}
      {afkeurenRec && (
        <AfkeurenDialog
          record={afkeurenRec}
          onBevestigen={reden => handleAfkeuren(afkeurenRec, reden)}
          onSluiten={() => setAfkeurenRec(null)}
        />
      )}
      {factureerRec && (
        <FacurerenDialog
          record={factureerRec}
          onBevestigen={(margeType, margeWaarde) =>
            handleFactureren(factureerRec, margeType, margeWaarde)
          }
          onSluiten={() => setFactureerRec(null)}
        />
      )}
    </div>
  );
}