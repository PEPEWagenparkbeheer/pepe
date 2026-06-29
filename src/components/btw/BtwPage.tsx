'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBtw } from '@/hooks/useBtw';
import { schietConfetti } from '@/lib/confetti';
import { authHeaders } from '@/lib/clientAuth';
import type { BtwAutoType, BtwRecord } from '@/types';
import type { FactuurRegel } from '@/types/factuur';
import BtwModal from './BtwModal';
import styles from './BtwPage.module.css';

// Bouwt de factuurregels voor een credit. Eén regel per gevuld credit-bedrag
// (leasemaatschappij / dealer); valt terug op het algemene bedrag als die leeg zijn.
// BTW staat default op 'hoog' (21%) — controleer/pas aan in de factuur vóór akkoord.
function bouwCreditRegels(r: BtwRecord): FactuurRegel[] {
  const auto = [r.auto, r.kenteken ? `(${r.kenteken})` : ''].filter(Boolean).join(' ').trim();
  const heeftLm = (r.lm_bedrag ?? 0) > 0;
  const heeftDealer = (r.dealer_bedrag ?? 0) > 0;
  const regels: FactuurRegel[] = [];
  if (heeftLm) regels.push({ omschrijving: `Credit leasemaatschappij — ${auto}`.trim(), aantal: 1, prijs_excl: r.lm_bedrag!, btw_code: 'hoog' });
  if (heeftDealer) regels.push({ omschrijving: `Credit dealer — ${auto}`.trim(), aantal: 1, prijs_excl: r.dealer_bedrag!, btw_code: 'hoog' });
  if (!heeftLm && !heeftDealer) regels.push({ omschrijving: `Credit — ${auto}`.trim(), aantal: 1, prijs_excl: r.bedrag ?? 0, btw_code: 'hoog' });
  return regels;
}

function bouwFactuurBody(r: BtwRecord) {
  return {
    type: 'diensten_overig',
    soort: 'factuur',
    status: 'concept',
    bron: 'btw_credit',
    klant_naam: r.dealer_verkoper || r.klant || null,
    regels: bouwCreditRegels(r),
    notitie: [
      'Doorgezet vanuit BTW/credit-lijst.',
      r.klant ? `Klant: ${r.klant}.` : '',
      r.kenteken ? `Kenteken: ${r.kenteken}.` : '',
      r.opmerkingen ? `Opm.: ${r.opmerkingen}` : '',
    ].filter(Boolean).join(' '),
  };
}

type Tab = 'lopend' | 'archief';

// ── Helpers ───────────────────────────────────────────────────
function Cb({ aan, onClick }: { aan: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

function metaTijd(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function PortalTip({ children, tip }: { children: React.ReactNode; tip: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      style={{ display: 'inline-flex' }}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: r.left, y: r.bottom + 8 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{
          position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999,
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12,
          color: 'var(--text)', pointerEvents: 'none',
          minWidth: 160, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
          whiteSpace: 'nowrap',
        }}>
          {tip}
        </div>,
        document.body,
      )}
    </div>
  );
}

function CbMeta({ aan, meta, onClick }: {
  aan: boolean;
  meta?: { op: string; door: string };
  onClick: (e: React.MouseEvent) => void;
}) {
  if (!meta) return <Cb aan={aan} onClick={onClick} />;
  return (
    <PortalTip tip={
      <div>
        <div style={{ fontWeight: 700 }}>{meta.door}</div>
        <div style={{ color: 'var(--muted)', marginTop: 2 }}>{metaTijd(meta.op)}</div>
      </div>
    }>
      <Cb aan={aan} onClick={onClick} />
    </PortalTip>
  );
}

function GeldCb({ aan, meta, beschikbaar, onClick }: {
  aan: boolean;
  meta?: { op: string; door: string };
  beschikbaar: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  if (!beschikbaar) return <div className={styles.cbWrap}><span className={styles.nvt}>N.V.T.</span></div>;
  return <div className={styles.cbWrap}><CbMeta aan={aan} meta={meta} onClick={onClick} /></div>;
}

const TYPE_CSS: Record<BtwAutoType, string> = {
  btw: styles.tpImport,
  credit: styles.tpNieuw,
};
const TYPE_LABEL: Record<BtwAutoType, string> = {
  btw: '🌍 BTW',
  credit: '% Credit',
};

function typeBadge(t?: string) {
  if (!t) return null;
  const cls = TYPE_CSS[t as BtwAutoType] ?? '';
  const label = TYPE_LABEL[t as BtwAutoType] ?? t;
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}

function bedragFmt(b?: number) {
  if (b == null) return '—';
  return '€ ' + b.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

type WachttijdVariant = 'normaal' | 'laat' | 'toekomst' | 'ontbreekt' | 'geen';

function wachttijdInfo(r: BtwRecord, binnenOpMap: Record<string, string>): { label: string; variant: WachttijdVariant } {
  if (r.type === 'credit') {
    if (!r.verwachte_leverdatum) return { label: 'Datum?', variant: 'ontbreekt' };
    const ms = Date.now() - new Date(r.verwachte_leverdatum).getTime();
    const dagen = Math.floor(ms / 86_400_000);
    if (dagen < 0) return { label: `over ${-dagen}dgn`, variant: 'toekomst' };
    return { label: `${dagen}dgn`, variant: dagen > 14 ? 'laat' : 'normaal' };
  }
  // type === 'btw' (import): wachttijd vanaf binnen_op in AfterSales
  const binnenOp = r.kenteken ? binnenOpMap[r.kenteken.toUpperCase()] : undefined;
  if (!binnenOp) return { label: '—', variant: 'geen' };
  const ms = Date.now() - new Date(binnenOp).getTime();
  const dagen = Math.floor(ms / 86_400_000);
  return { label: `${dagen}dgn`, variant: dagen > 14 ? 'laat' : 'normaal' };
}

function zoekMatch(r: BtwRecord, q: string): boolean {
  return `${r.kenteken ?? ''} ${r.auto} ${r.klant ?? ''} ${r.berijder ?? ''} ${r.dealer_verkoper ?? ''}`.toLowerCase().includes(q.toLowerCase());
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ records, onTab }: { records: BtwRecord[]; onTab: (t: Tab) => void }) {
  const nu = new Date();
  const lopend = records.filter((r) => !r.gearchiveerd);
  const teOntvangen = lopend.reduce((s, r) => s + (r.bedrag ?? 0) + (r.lm_bedrag ?? 0) + (r.dealer_bedrag ?? 0), 0);

  const importBtw = lopend.filter((r) => r.type === 'btw');
  const importBtwBedrag = importBtw.reduce((s, r) => s + (r.bedrag ?? 0), 0);

  const creditNaLeverdatum = lopend.filter((r) => {
    if (!r.verwachte_leverdatum) return false;
    if (r.geld_van_lm || r.geld_van_dealer) return false;
    return new Date(r.verwachte_leverdatum) < nu;
  }).length;

  const ouderDan14 = lopend.filter((r) => {
    if (r.geld_van_lm || r.geld_van_dealer) return false;
    if (!r.ingekocht_op) return false;
    return (nu.getTime() - new Date(r.ingekocht_op).getTime()) > 14 * 86_400_000;
  }).length;

  return (
    <div className={styles.kpiStrip}>
      <div className={`${styles.kpiCard} ${lopend.length > 0 ? styles.warn : ''}`} onClick={() => onTab('lopend')}>
        <div className={styles.kpiIcoon}>⏳</div>
        <div className={styles.kpiGetal}>{lopend.length}</div>
        <div className={styles.kpiLabel}>Openstaande claims</div>
      </div>
      <div className={`${styles.kpiCard} ${styles.hot}`} onClick={() => onTab('lopend')}>
        <div className={styles.kpiIcoon}>💶</div>
        <div className={styles.kpiGetal} style={{ fontSize: teOntvangen > 99999 ? 16 : 22 }}>{bedragFmt(teOntvangen)}</div>
        <div className={styles.kpiLabel}>Te ontvangen</div>
      </div>
      <div className={`${styles.kpiCard} ${importBtw.length > 0 ? styles.warn : ''}`} onClick={() => onTab('lopend')}>
        <div className={styles.kpiIcoon}>🚚</div>
        <div className={styles.kpiGetal} style={{ fontSize: importBtwBedrag > 99999 ? 16 : 22 }}>
          {importBtw.length > 0 ? bedragFmt(importBtwBedrag) : '—'}
        </div>
        <div className={styles.kpiLabel}>Openstaand import BTW</div>
      </div>
      <div className={`${styles.kpiCard} ${creditNaLeverdatum > 0 ? styles.hot : ''}`} onClick={() => onTab('lopend')}>
        <div className={styles.kpiIcoon}>📅</div>
        <div className={`${styles.kpiGetal} ${creditNaLeverdatum > 0 ? styles.warn : ''}`}>{creditNaLeverdatum}</div>
        <div className={styles.kpiLabel}>Credit na leverdatum</div>
      </div>
      <div className={`${styles.kpiCard} ${ouderDan14 > 0 ? styles.hot : ''}`} onClick={() => onTab('lopend')}>
        <div className={styles.kpiIcoon}>🔴</div>
        <div className={`${styles.kpiGetal} ${ouderDan14 > 0 ? styles.warn : ''}`}>{ouderDan14}</div>
        <div className={styles.kpiLabel}>+14 dagen open</div>
      </div>
    </div>
  );
}

// ── Tab: Lopend ───────────────────────────────────────────────
function TabLopend({ records, zoek, binnenOpMap, onEdit, onToggle, onArchiveer, onNaarFacturatie, bezigId }: {
  records: BtwRecord[];
  zoek: string;
  binnenOpMap: Record<string, string>;
  onEdit: (r: BtwRecord) => void;
  onToggle: (id: string, veld: keyof BtwRecord) => Promise<boolean>;
  onArchiveer: (r: BtwRecord) => void;
  onNaarFacturatie: (r: BtwRecord) => void;
  bezigId: string | null;
}) {
  const rijen = records.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen lopende BTW / credit records</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Auto</th>
          <th>Type</th>
          <th>Klant</th>
          <th>Dealer / Verkoper</th>
          <th>Ingekocht</th>
          <th className={styles.chk}>Gelangenbest.</th>
          <th className={styles.chk}>Geld LM</th>
          <th className={styles.chk}>Geld dealer</th>
          <th>Bedrag</th>
          <th>Wachttijd</th>
          <th>Opmerkingen</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const wt = wachttijdInfo(r, binnenOpMap);
            const isLaat = wt.variant === 'laat' && !r.geld_van_lm && !r.geld_van_dealer;
            const isImport = r.type === 'btw';
            const isCredit = r.type === 'credit';
            const heeftLm = (r.lm_bedrag ?? 0) > 0;
            const heeftDealer = (r.dealer_bedrag ?? 0) > 0;

            return (
              <tr key={r.id} className={isLaat ? styles.laat : ''} onClick={() => onEdit(r)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.auto}</div>
                  {r.kenteken && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.kenteken}</div>}
                </td>
                <td>{typeBadge(r.type)}</td>
                <td>{r.klant || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.dealer_verkoper || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{datumFmt(r.ingekocht_op)}</td>

                {/* Gelangenbest: alleen import, credit heeft dit niet */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  {isImport ? (
                    <div className={styles.cbWrap}>
                      <CbMeta
                        aan={!!r.gelangenbest_verstuurd}
                        meta={r.veld_meta?.['gelangenbest_verstuurd']}
                        onClick={() => onToggle(r.id, 'gelangenbest_verstuurd')}
                      />
                    </div>
                  ) : (
                    <div className={styles.cbWrap}><span className={styles.nvt}>N.V.T.</span></div>
                  )}
                </td>

                {/* Geld LM: import = N.V.T., credit = checkbaar als lm_bedrag > 0 */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <GeldCb
                    aan={!!r.geld_van_lm}
                    meta={r.veld_meta?.['geld_van_lm']}
                    beschikbaar={isCredit && heeftLm}
                    onClick={() => onToggle(r.id, 'geld_van_lm')}
                  />
                </td>

                {/* Geld dealer: import altijd checkbaar, credit checkbaar als dealer_bedrag > 0 */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <GeldCb
                    aan={!!r.geld_van_dealer}
                    meta={r.veld_meta?.['geld_van_dealer']}
                    beschikbaar={isImport || (isCredit && heeftDealer)}
                    onClick={() => onToggle(r.id, 'geld_van_dealer')}
                  />
                </td>

                <td style={{ whiteSpace: 'nowrap' }}>
                  {isCredit && (heeftLm || heeftDealer) ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', lineHeight: 1.6 }}>
                      {heeftLm && <div>LM: {bedragFmt(r.lm_bedrag)}</div>}
                      {heeftDealer && <div>Dealer: {bedragFmt(r.dealer_bedrag)}</div>}
                    </div>
                  ) : (
                    <span style={{ fontWeight: 600, color: 'var(--green)' }}>{bedragFmt(r.bedrag)}</span>
                  )}
                </td>

                <td>
                  {wt.variant === 'geen' ? '—' : (
                    <span className={`${styles.wachttijdChip} ${wt.variant === 'laat' ? styles.wachttijdLaat : ''} ${wt.variant === 'toekomst' ? styles.wachttijdToekomst : ''} ${wt.variant === 'ontbreekt' ? styles.wachttijdOntbreekt : ''}`}>
                      {wt.label}
                    </span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 160 }}>{r.opmerkingen || '—'}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                  {isCredit && (
                    <button
                      className="btn btn-a"
                      style={{ fontSize: 11, padding: '4px 10px', marginRight: 6 }}
                      disabled={bezigId === r.id}
                      onClick={() => onNaarFacturatie(r)}
                    >
                      {bezigId === r.id ? '…' : '→ Facturatie'}
                    </button>
                  )}
                  <button className={styles.archiefKnop} onClick={() => onArchiveer(r)}>✓ Archief</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Archief ──────────────────────────────────────────────
function TabArchief({ records, zoek, onEdit, onTerugzetten }: {
  records: BtwRecord[];
  zoek: string;
  onEdit: (r: BtwRecord) => void;
  onTerugzetten: (r: BtwRecord) => void;
}) {
  const rijen = records.filter((r) => r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Archief is leeg</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Auto</th>
          <th>Type</th>
          <th>Klant</th>
          <th>Dealer / Verkoper</th>
          <th>Ingekocht</th>
          <th>Bedrag</th>
          <th>Opmerkingen</th>
          <th>Acties</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.auto}</div>
                {r.kenteken && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.kenteken}</div>}
              </td>
              <td>{typeBadge(r.type)}</td>
              <td>{r.klant || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.dealer_verkoper || '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{datumFmt(r.ingekocht_op)}</td>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{bedragFmt(r.bedrag)}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>{r.opmerkingen || '—'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onTerugzetten(r)}>↩ Terugzetten</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────
export default function BtwPage() {
  const { records, loading, binnenOpMap, add, save, remove, toggle } = useBtw();
  const [tab, setTab] = useState<Tab>('lopend');
  const [zoek, setZoek] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BtwRecord | null>(null);
  const [bezigId, setBezigId] = useState<string | null>(null);

  function openEdit(r: BtwRecord) { setEditRecord(r); setModalOpen(true); }
  function openNieuw() { setEditRecord(null); setModalOpen(true); }

  // Zet een credit door naar de facturatie-module (concept-factuur) en archiveer 'm.
  async function handleNaarFacturatie(r: BtwRecord) {
    if (bezigId) return;
    if (!confirm(`Credit "${r.auto}" doorzetten naar facturatie?\n\nEr wordt een concept-factuur aangemaakt en de credit gaat naar het archief.`)) return;
    setBezigId(r.id);
    try {
      const res = await fetch('/api/uitgaande-facturen', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(bouwFactuurBody(r)),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error ?? 'Aanmaken concept-factuur mislukt'); return; }
      await save({ ...r, gearchiveerd: true });
      schietConfetti();
      alert('✅ Concept-factuur aangemaakt in Facturatie. De credit staat nu in het archief — werk de factuur daar verder af.');
    } catch (e) {
      alert(`Aanmaken concept-factuur mislukt: ${String(e)}`);
    } finally {
      setBezigId(null);
    }
  }

  async function handleOpslaan(rec: BtwRecord | Omit<BtwRecord, 'id' | 'created_at'>) {
    if ('id' in rec) await save(rec as BtwRecord);
    else await add(rec);
  }

  async function handleToggle(id: string, veld: keyof BtwRecord): Promise<boolean> {
    const archived = await toggle(id, veld);
    if (archived) schietConfetti();
    return archived;
  }

  async function handleArchiveer(r: BtwRecord) {
    await save({ ...r, gearchiveerd: true });
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.tabBalk}>
        <button className={`tab ${tab === 'lopend' ? 'on' : ''}`} onClick={() => setTab('lopend')}>Lopend</button>
        <button className={`tab ${tab === 'archief' ? 'on' : ''}`} onClick={() => setTab('archief')}>Archief</button>
        <div className={styles.tabBalkRechts}>
          <input className={styles.zoekbalk} placeholder="Zoeken..." value={zoek} onChange={(e) => setZoek(e.target.value)} />
          <button className="btn btn-a" onClick={openNieuw}>+ Toevoegen</button>
        </div>
      </div>

      <KpiStrip records={records} onTab={setTab} />

      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'lopend'  && <TabLopend  records={records} zoek={zoek} binnenOpMap={binnenOpMap} onEdit={openEdit} onToggle={handleToggle} onArchiveer={handleArchiveer} onNaarFacturatie={handleNaarFacturatie} bezigId={bezigId} />}
          {tab === 'archief' && <TabArchief records={records} zoek={zoek} onEdit={openEdit} onTerugzetten={(r) => save({ ...r, gearchiveerd: false })} />}
        </>
      )}

      <BtwModal
        record={editRecord}
        open={modalOpen}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={remove}
      />
    </div>
  );
}
