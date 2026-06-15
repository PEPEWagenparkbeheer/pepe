'use client';

import { useState } from 'react';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import type { WerkDerdenRecord } from '@/types';
import styles from './WerkDerdenOverzicht.module.css';

type Tab = 'open' | 'afgekeurd' | 'gefactureerd';

function euroFmt(n?: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}

function datumFmt(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return d; }
}

interface FacurerenDialogProps {
  record: WerkDerdenRecord;
  onBevestigen: (verkoop_bedrag: number) => void;
  onSluiten: () => void;
}

function FacurerenDialog({ record, onBevestigen, onSluiten }: FacurerenDialogProps) {
  const inkoopTotaal = record.inkoop_bedrag ?? record.regels.reduce((s, r) => s + r.bedrag, 0);
  const [verkoopBedrag, setVerkoopBedrag] = useState<string>(String(inkoopTotaal.toFixed(2)));
  const [bezig, setBezig] = useState(false);

  const marge = (parseFloat(verkoopBedrag) || 0) - inkoopTotaal;
  const margePct = inkoopTotaal > 0 ? (marge / inkoopTotaal) * 100 : 0;

  async function bevestigen() {
    const bedrag = parseFloat(verkoopBedrag);
    if (isNaN(bedrag) || bedrag <= 0) return;
    setBezig(true);
    try {
      await onBevestigen(bedrag);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h3 className={styles.dialogTitel}>Factureren</h3>

        <div className={styles.dialogInfo}>
          <div className={styles.dialogRij}>
            <span>Partner</span><strong>{record.partner}</strong>
          </div>
          <div className={styles.dialogRij}>
            <span>Kenteken</span><strong>{record.kenteken}</strong>
          </div>
          {record.klant && (
            <div className={styles.dialogRij}>
              <span>Klant</span><strong>{record.klant}</strong>
            </div>
          )}
          <div className={styles.dialogRij}>
            <span>Inkoop (excl. BTW)</span><strong>{euroFmt(inkoopTotaal)}</strong>
          </div>
        </div>

        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Verkoopbedrag (excl. BTW)</label>
          <div className={styles.bedragWrapper}>
            <span className={styles.euroPrefix}>€</span>
            <input
              type="number"
              className={styles.bedragInput}
              min="0"
              step="0.01"
              value={verkoopBedrag}
              onChange={e => setVerkoopBedrag(e.target.value)}
            />
          </div>
          {inkoopTotaal > 0 && (
            <div className={`${styles.margeInfo} ${marge > 0 ? styles.margePos : marge < 0 ? styles.margeNeg : ''}`}>
              Marge: {euroFmt(marge)} ({margePct > 0 ? '+' : ''}{margePct.toFixed(1)}%)
            </div>
          )}
        </div>

        <div className={styles.dialogKnoppen}>
          <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
          <button className={styles.bevestigenKnop} onClick={bevestigen} disabled={bezig || !verkoopBedrag}>
            {bezig ? 'Bezig…' : 'Factuur aanmaken'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AfkeurDialogProps {
  onBevestigen: (reden: string) => void;
  onSluiten: () => void;
}

function AfkeurDialog({ onBevestigen, onSluiten }: AfkeurDialogProps) {
  const [reden, setReden] = useState('');
  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h3 className={styles.dialogTitel}>Afkeuren</h3>
        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Reden</label>
          <textarea
            className={styles.dialogTextarea}
            placeholder="Bijv. tarief te hoog, niet akkoord…"
            rows={3}
            value={reden}
            onChange={e => setReden(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.dialogKnoppen}>
          <button className={styles.annuleerKnop} onClick={onSluiten}>Annuleren</button>
          <button className={styles.bevestigenKnop} onClick={() => onBevestigen(reden)} disabled={!reden.trim()}>
            Afkeuren
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WerkDerdenOverzicht() {
  const { records, loading, openCount, setAfgekeurd, setGefactureerd, bijlageUrl } = useWerkDerden(undefined, 'pepe');
  const [tab, setTab] = useState<Tab>('open');
  const [facturerRec, setFacturerRec] = useState<WerkDerdenRecord | null>(null);
  const [afkeurRec, setAfkeurRec] = useState<WerkDerdenRecord | null>(null);
  const [bijlageBezig, setBijlageBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const filtered = records.filter(r => r.status === tab);

  async function openBijlage(rec: WerkDerdenRecord) {
    if (!rec.bijlage_storage_path) return;
    setBijlageBezig(rec.id);
    const url = await bijlageUrl(rec.bijlage_storage_path);
    setBijlageBezig(null);
    if (url) window.open(url, '_blank');
  }

  async function handleAfkeuren(rec: WerkDerdenRecord, reden: string) {
    const res = await setAfgekeurd(rec.id, reden);
    setAfkeurRec(null);
    setMelding({ ok: res.ok, tekst: res.ok ? 'Afgekeurd.' : res.error ?? 'Fout' });
    setTimeout(() => setMelding(null), 3000);
  }

  async function handleFactureren(rec: WerkDerdenRecord, verkoop_bedrag: number) {
    const res = await setGefactureerd(rec.id, verkoop_bedrag);
    setFacturerRec(null);
    setMelding({ ok: res.ok, tekst: res.ok ? 'Gefactureerd!' : res.error ?? 'Fout' });
    setTimeout(() => setMelding(null), 4000);
  }

  if (loading) {
    return (
      <div className={styles.pagina}>
        <div className={styles.header}>
          <h1 className={styles.paginaTitel}>Werk Derden</h1>
        </div>
        <div className={styles.laden}>Laden…</div>
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.paginaTitel}>🔨 Werk Derden</h1>
          <p className={styles.paginaSub}>Partner-kosten beoordelen en doorbelasten</p>
        </div>
        {openCount > 0 && (
          <div className={styles.openBadge}>{openCount} open</div>
        )}
      </div>

      {melding && (
        <div className={`${styles.melding} ${melding.ok ? styles.meldingOk : styles.meldingFout}`}>
          {melding.tekst}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['open', 'afgekeurd', 'gefactureerd'] as Tab[]).map(t => {
          const count = records.filter(r => r.status === t).length;
          return (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActief : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'open' ? 'Open' : t === 'afgekeurd' ? 'Afgekeurd' : 'Gefactureerd'}
              {count > 0 && <span className={styles.tabBadge}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Tabel */}
      {filtered.length === 0 ? (
        <div className={styles.leeg}>Geen meldingen met status "{tab}".</div>
      ) : (
        <div className={styles.tabelWrapper}>
          <table className={styles.tabel}>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Partner</th>
                <th>Kenteken / Klant</th>
                <th>Regels</th>
                <th>Inkoop (excl. BTW)</th>
                {tab === 'gefactureerd' && <th>Verkoop</th>}
                <th>Bijlage</th>
                {tab === 'open' && <th>Acties</th>}
                {tab !== 'open' && <th>Info</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className={styles.rij}>
                  <td className={styles.datumKolom}>{datumFmt(r.created_at)}</td>
                  <td><strong>{r.partner}</strong></td>
                  <td>
                    <span className={styles.kenteken}>{r.kenteken}</span>
                    {r.klant && <span className={styles.klant}>{r.klant}</span>}
                  </td>
                  <td>
                    <div className={styles.regelLijst}>
                      {r.regels.map((regel, i) => (
                        <div key={i} className={styles.regelRij}>
                          <span className={styles.regelOmschrijving}>{regel.omschrijving}</span>
                          <span className={styles.regelBedrag}>{euroFmt(regel.bedrag)}</span>
                        </div>
                      ))}
                    </div>
                    {r.notitie && <div className={styles.notitie}>{r.notitie}</div>}
                  </td>
                  <td className={styles.bedragKolom}>
                    <strong>{euroFmt(r.inkoop_bedrag)}</strong>
                    {r.btw_pct != null && <span className={styles.btwInfo}>+ {r.btw_pct}% btw</span>}
                  </td>
                  {tab === 'gefactureerd' && (
                    <td className={styles.bedragKolom}>
                      <strong>{euroFmt(r.verkoop_bedrag)}</strong>
                    </td>
                  )}
                  <td>
                    {r.bijlage_storage_path ? (
                      <button
                        className={styles.bijlageKnop}
                        onClick={() => openBijlage(r)}
                        disabled={bijlageBezig === r.id}
                      >
                        {bijlageBezig === r.id ? '…' : '📎 Bekijken'}
                      </button>
                    ) : (
                      <span className={styles.geenBijlage}>—</span>
                    )}
                  </td>
                  {tab === 'open' && (
                    <td>
                      <div className={styles.actieKnoppen}>
                        <button
                          className={styles.facturerenKnop}
                          onClick={() => setFacturerRec(r)}
                        >
                          ✓ Factureren
                        </button>
                        <button
                          className={styles.afkeurenKnop}
                          onClick={() => setAfkeurRec(r)}
                        >
                          ✕ Afkeuren
                        </button>
                      </div>
                    </td>
                  )}
                  {tab !== 'open' && (
                    <td>
                      {tab === 'afgekeurd' && r.afkeur_reden && (
                        <span className={styles.afkeurReden}>{r.afkeur_reden}</span>
                      )}
                      {tab === 'gefactureerd' && r.gefactureerd_op && (
                        <span className={styles.gefactureerdOp}>{datumFmt(r.gefactureerd_op)}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {facturerRec && (
        <FacurerenDialog
          record={facturerRec}
          onBevestigen={(bedrag) => handleFactureren(facturerRec, bedrag)}
          onSluiten={() => setFacturerRec(null)}
        />
      )}

      {afkeurRec && (
        <AfkeurDialog
          onBevestigen={(reden) => handleAfkeuren(afkeurRec, reden)}
          onSluiten={() => setAfkeurRec(null)}
        />
      )}
    </div>
  );
}
