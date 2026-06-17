'use client';

import { useState } from 'react';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import { useAuth } from '@/hooks/useAuth';
import WerkDerdenModal from '@/components/partner/WerkDerdenModal';
import type { WerkDerdenRecord, WerkRegel } from '@/types';
import styles from './WerkDerdenOverzicht.module.css';

type Tab = 'open' | 'goedgekeurd' | 'klaar_gemeld' | 'gefactureerd' | 'afgerond' | 'afgekeurd';

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
  onBevestigen: (opties: { klant: string; regels?: WerkRegel[]; voorwaarden?: string }) => Promise<void>;
  onSluiten: () => void;
}

function GoedkeurenDialog({ record, onBevestigen, onSluiten }: GoedkeurenDialogProps) {
  const [bezig, setBezig] = useState(false);
  const [klant, setKlant] = useState(record.klant ?? '');
  const [metVoorwaarden, setMetVoorwaarden] = useState(false);
  const [regels, setRegels] = useState<WerkRegel[]>(record.regels ?? []);
  const [voorwaarden, setVoorwaarden] = useState('');
  const voertuig = record.kenteken ?? record.meldcode ?? '—';
  const merk = [record.merk, record.model].filter(Boolean).join(' ') || null;
  const totaal = regels.reduce((s, r) => s + (r.bedrag ?? 0), 0);

  async function handlerKlik() {
    setBezig(true);
    try {
      const opties: { klant: string; regels?: WerkRegel[]; voorwaarden?: string } = { klant: klant.trim() };
      if (metVoorwaarden) {
        opties.regels = regels;
        if (voorwaarden.trim()) opties.voorwaarden = voorwaarden.trim();
      }
      await onBevestigen(opties);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className={styles.dialogOverlay} onClick={onSluiten}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.dialogTitel}>
          {metVoorwaarden ? 'Goedkeuren met voorwaarden' : 'Werkzaamheden goedkeuren'}
        </h2>
        <div className={styles.dialogInfo}>
          <div className={styles.dialogRij}><span>Voertuig</span>{voertuig}{merk ? ` — ${merk}` : ''}</div>
          <div className={styles.dialogRij}><span>Partner</span>{record.partner}</div>
          <div className={styles.dialogRij}><span>Inkoop</span>{euroFmt(record.inkoop_bedrag)}</div>
        </div>
        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>Klant</label>
          <input
            className={styles.dialogInput}
            value={klant}
            onChange={e => setKlant(e.target.value)}
            placeholder="Naam klant — moet matchen met HubSpot voor facturatie…"
          />
        </div>
        {metVoorwaarden && (
          <>
            <div className={styles.dialogVeld}>
              <label className={styles.dialogLabel}>Kostenregels aanpassen</label>
              {regels.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{r.omschrijving}</span>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.dialogInput}
                    style={{ width: 100 }}
                    value={r.bedrag ?? 0}
                    onChange={e => {
                      const copy = [...regels];
                      copy[idx] = { ...copy[idx], bedrag: parseFloat(e.target.value) || 0 };
                      setRegels(copy);
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Totaal: {euroFmt(totaal)}</div>
            </div>
            <div className={styles.dialogVeld}>
              <label className={styles.dialogLabel}>Voorwaarden / aanpassingen</label>
              <textarea
                className={styles.dialogInput}
                rows={3}
                value={voorwaarden}
                onChange={e => setVoorwaarden(e.target.value)}
                placeholder="Omschrijf de voorwaarden of aanpassingen die PEPE heeft goedgekeurd…"
                style={{ resize: 'vertical' }}
              />
            </div>
          </>
        )}
        <div className={styles.dialogKnoppen}>
          <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
          {!metVoorwaarden && (
            <button
              type="button"
              className={styles.annuleerKnop}
              style={{ background: 'rgba(234,179,8,0.10)', borderColor: 'rgba(234,179,8,0.4)' }}
              onClick={() => setMetVoorwaarden(true)}
              disabled={bezig}
            >✎ Met voorwaarden</button>
          )}
          <button className={styles.bevestigenKnop} onClick={handlerKlik} disabled={bezig}>
            {bezig ? 'Verwerken…' : metVoorwaarden ? '✓ Goedkeuren met voorwaarden' : '✓ Goedkeuren'}
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
  onBevestigen: (margeType: 'pct' | 'bedrag', margeWaarde: number, btwPct: number) => Promise<void>;
  onSluiten: () => void;
}

function FacurerenDialog({ record, onBevestigen, onSluiten }: FacurerenDialogProps) {
  const inkoopTotaal = record.inkoop_bedrag ?? record.regels.reduce((s, r) => s + r.bedrag, 0);
  const [margeType, setMargeType] = useState<'pct' | 'bedrag'>(record.marge_type ?? 'pct');
  const [margeWaarde, setMargeWaarde] = useState<string>(
    record.marge_waarde != null ? String(record.marge_waarde) : '',
  );
  const [btwPct, setBtwPct] = useState(record.btw_pct ?? 21);
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
    try { await onBevestigen(margeType, margeNum, btwPct); } finally { setBezig(false); }
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
            <div className={styles.dialogRij}><span>Goedgekeurd</span>{datumFmt(record.goedgekeurd_op)}{record.goedgekeurd_door ? ` — ${record.goedgekeurd_door}` : ''}</div>
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

        <div className={styles.dialogVeld}>
          <label className={styles.dialogLabel}>BTW op verkoopfactuur</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[21, 0].map(pct => (
              <button key={pct} type="button" onClick={() => setBtwPct(pct)} style={toggleStyle(btwPct === pct)}>
                {pct}%
              </button>
            ))}
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
  const { records, loading, addRecord, updateRecord, setGoedgekeurd, setAfgekeurd, setAfgerond, bijlageUrl } =
    useWerkDerden();
  const { user } = useAuth();
  const stamper = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'PEPE';
  const [tab, setTab] = useState<Tab>('open');
  const [zoek, setZoek] = useState('');
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [goedkeurenRec, setGoedkeurenRec] = useState<WerkDerdenRecord | null>(null);
  const [afkeurenRec, setAfkeurenRec] = useState<WerkDerdenRecord | null>(null);
  const [factureerRec, setFactureerRec] = useState<WerkDerdenRecord | null>(null);

  function toonMelding(tekst: string, ok: boolean) {
    setMelding({ tekst, ok });
    setTimeout(() => setMelding(null), 4000);
  }

  const zoekTerm = zoek.trim().toLowerCase();
  const gefilterd = records.filter(r => {
    if (r.status !== tab) return false;
    if (!zoekTerm) return true;
    return [r.kenteken, r.meldcode, r.partner, r.klant, r.merk, r.model]
      .some(v => v?.toLowerCase().includes(zoekTerm));
  });

  const tabLabels: Record<Tab, string> = {
    open: 'Open',
    goedgekeurd: 'Goedgekeurd',
    klaar_gemeld: 'Klaar gemeld',
    gefactureerd: 'Gefactureerd',
    afgerond: 'Afgerond',
    afgekeurd: 'Afgekeurd',
  };

  const tabIconen: Record<Tab, string> = {
    open: '📥',
    goedgekeurd: '✓',
    klaar_gemeld: '🔧',
    gefactureerd: '🧾',
    afgerond: '🏁',
    afgekeurd: '✗',
  };

  async function openBijlage(rec: WerkDerdenRecord) {
    if (!rec.bijlage_storage_path) return;
    const url = await bijlageUrl(rec.bijlage_storage_path);
    if (url) window.open(url, '_blank');
  }

  async function handleGoedkeuren(rec: WerkDerdenRecord, opties: { klant: string; regels?: WerkRegel[]; voorwaarden?: string }) {
    setGoedkeurenRec(null);
    setBezig(rec.id);
    try {
      await setGoedgekeurd(rec.id, { ...opties, door: stamper });
      toonMelding('Werkzaamheden goedgekeurd ✓', true);
    } catch {
      toonMelding('Fout bij goedkeuren', false);
    } finally {
      setBezig(null);
    }
  }

  async function handleAfronden(id: string) {
    setBezig(id);
    try {
      await setAfgerond(id, stamper);
      toonMelding('Afgerond ✓', true);
    } catch {
      toonMelding('Fout bij afronden', false);
    } finally {
      setBezig(null);
    }
  }


  async function handleAfkeuren(rec: WerkDerdenRecord, reden: string) {
    setAfkeurenRec(null);
    setBezig(rec.id);
    try {
      await setAfgekeurd(rec.id, reden, stamper);
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
    btwPct: number,
  ) {
    setFactureerRec(null);
    setBezig(rec.id);
    try {
      const res = await fetch('/api/werk-derden/factureren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, marge_type: margeType, marge_waarde: margeWaarde, btw_pct: btwPct }),
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

  async function handleVerrijken(rec: WerkDerdenRecord) {
    if (!rec.kenteken) return;
    setBezig(rec.id);
    try {
      const res = await fetch(`/api/werk-derden/lookup?kenteken=${encodeURIComponent(rec.kenteken)}`);
      const data = await res.json() as { klant: string | null; hubspot_deal_id: string | null; merk: string | null; model: string | null };
      const patch: Record<string, string | null> = {};
      if (data.merk) patch.merk = data.merk;
      if (data.model) patch.model = data.model;
      if (data.klant) patch.klant = data.klant;
      if (data.hubspot_deal_id) patch.hubspot_deal_id = data.hubspot_deal_id;
      if (Object.keys(patch).length === 0) {
        toonMelding('Geen RDW/HubSpot-data gevonden', false);
        return;
      }
      await updateRecord(rec.id, patch as never);
      toonMelding('Verrijkt met RDW/HubSpot ✓', true);
    } catch {
      toonMelding('Fout bij verrijken', false);
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

  const tabVolgorde: Tab[] = ['open', 'goedgekeurd', 'klaar_gemeld', 'gefactureerd', 'afgerond', 'afgekeurd'];

  return (
    <div className={styles.pagina}>
      <div className={styles.tabBalk}>
        {tabVolgorde.map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'on' : ''}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
        <div className={styles.tabBalkRechts}>
          <input
            className={styles.zoekbalk}
            placeholder="Zoeken in werk derden..."
            value={zoek}
            onChange={e => setZoek(e.target.value)}
          />
          <button className="btn" onClick={exportXlsx}>⬇ Excel</button>
          <button className="btn btn-a" onClick={() => setNieuwOpen(true)}>+ Nieuw</button>
        </div>
      </div>

      <div className={styles.kpiStrip}>
        {tabVolgorde.map(t => {
          const count = records.filter(r => r.status === t).length;
          const accent = t === 'open' && count > 0 ? styles.hot
            : (t === 'gefactureerd' || t === 'afgerond') && count > 0 ? styles.good
            : '';
          const getalAccent = t === 'open' && count > 0 ? styles.warn
            : (t === 'gefactureerd' || t === 'afgerond') && count > 0 ? styles.ok
            : '';
          return (
            <div
              key={t}
              className={`${styles.kpiCard} ${accent} ${tab === t ? styles.actief : ''}`}
              onClick={() => setTab(t)}
            >
              <div className={styles.kpiIcoon}>{tabIconen[t]}</div>
              <div className={`${styles.kpiGetal} ${getalAccent}`}>{count}</div>
              <div className={styles.kpiLabel}>{tabLabels[t]}</div>
            </div>
          );
        })}
      </div>

      {melding && (
        <div className={`${styles.melding} ${melding.ok ? styles.meldingOk : styles.meldingFout}`}>
          {melding.tekst}
        </div>
      )}

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
                {(tab === 'gefactureerd') && <th style={{ textAlign: 'right' }}>Verkoop</th>}
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
                      {rec.bestemming === 'voertuigprijs' && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', background: 'rgba(82,196,126,0.15)', color: '#32a868', borderRadius: 4, padding: '2px 6px', marginLeft: 6 }}>VP</span>}
                    </td>
                    <td>
                      {rec.partner}
                      {rec.goedgekeurd_door && <span className={styles.klant}>✓ {rec.goedgekeurd_door}</span>}
                      {rec.afgekeurd_door && <span className={styles.klant}>✕ {rec.afgekeurd_door}</span>}
                    </td>
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
                        {(tab === 'goedgekeurd' || tab === 'klaar_gemeld') && (
                          <>
                            {rec.bestemming === 'voertuigprijs' ? (
                              <button
                                className={styles.facturerenKnop}
                                onClick={() => handleAfronden(rec.id)}
                                disabled={isBusy}
                                style={{ background: 'rgba(82,196,126,0.15)', color: '#32a868', borderColor: 'rgba(82,196,126,0.4)' }}
                              >
                                ✓ Afronden
                              </button>
                            ) : (
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
          onBevestigen={(opties) => handleGoedkeuren(goedkeurenRec, opties)}
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
          onBevestigen={(margeType, margeWaarde, btwPct) =>
            handleFactureren(factureerRec, margeType, margeWaarde, btwPct)
          }
          onSluiten={() => setFactureerRec(null)}
        />
      )}
      {nieuwOpen && (
        <WerkDerdenModal
          addRecord={addRecord}
          onSluiten={() => setNieuwOpen(false)}
          onIngediend={() => toonMelding('Kosten ingediend ✓', true)}
        />
      )}
    </div>
  );
}
