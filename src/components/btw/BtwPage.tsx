'use client';

import { useState } from 'react';
import { useBtw } from '@/hooks/useBtw';
import type { BtwAutoType, BtwRecord } from '@/types';
import BtwModal from './BtwModal';
import styles from './BtwPage.module.css';

type Tab = 'lopend' | 'archief';

// ── Helpers ───────────────────────────────────────────────────
function Cb({ aan, onClick }: { aan: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
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
  return '€ ' + b.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

function dagenGelden(ingekocht?: string): number | null {
  if (!ingekocht) return null;
  const ms = Date.now() - new Date(ingekocht).getTime();
  return Math.floor(ms / 86_400_000);
}

function zoekMatch(r: BtwRecord, q: string): boolean {
  return `${r.kenteken ?? ''} ${r.auto} ${r.klant ?? ''} ${r.berijder ?? ''} ${r.dealer_verkoper ?? ''}`.toLowerCase().includes(q.toLowerCase());
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ records }: { records: BtwRecord[] }) {
  const lopend = records.filter((r) => !r.gearchiveerd);
  const gelangenbest = lopend.filter((r) => r.gelangenbest_verstuurd).length;
  const vanLm = lopend.filter((r) => r.geld_van_lm).length;
  const vanDealer = lopend.filter((r) => r.geld_van_dealer).length;
  const totaal = lopend.reduce((s, r) => s + (r.bedrag ?? 0), 0);

  return (
    <div className={styles.kpiStrip}>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>💶</div>
        <div className={styles.kpiGetal}>{lopend.length}</div>
        <div className={styles.kpiLabel}>Lopend</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>📄</div>
        <div className={`${styles.kpiGetal} ${gelangenbest === lopend.length && lopend.length > 0 ? styles.ok : ''}`}>{gelangenbest}</div>
        <div className={styles.kpiLabel}>Gelangenbest.</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>🏢</div>
        <div className={`${styles.kpiGetal} ${vanLm === lopend.length && lopend.length > 0 ? styles.ok : ''}`}>{vanLm}</div>
        <div className={styles.kpiLabel}>Geld van LM</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>🤝</div>
        <div className={`${styles.kpiGetal} ${vanDealer === lopend.length && lopend.length > 0 ? styles.ok : ''}`}>{vanDealer}</div>
        <div className={styles.kpiLabel}>Geld van dealer</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>💰</div>
        <div className={styles.kpiGetal} style={{ fontSize: totaal > 99999 ? 16 : 22 }}>{bedragFmt(totaal)}</div>
        <div className={styles.kpiLabel}>Totaal openstaand</div>
      </div>
    </div>
  );
}

// ── Tab: Lopend ───────────────────────────────────────────────
function TabLopend({ records, zoek, onEdit, onToggle, onArchiveer }: {
  records: BtwRecord[];
  zoek: string;
  onEdit: (r: BtwRecord) => void;
  onToggle: (id: string, veld: keyof BtwRecord) => void;
  onArchiveer: (r: BtwRecord) => void;
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
            const dagen = dagenGelden(r.ingekocht_op);
            const isLaat = (dagen ?? 0) > 14 && !r.geld_van_lm && !r.geld_van_dealer;
            return (
              <tr key={r.id} className={isLaat ? styles.laat : ''} onClick={() => onEdit(r)}>
                <td style={{ fontWeight: 600 }}>{r.auto}</td>
                <td>{typeBadge(r.type)}</td>
                <td>{r.klant || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.dealer_verkoper || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{datumFmt(r.ingekocht_op)}</td>
                <td className={styles.chk}><Cb aan={!!r.gelangenbest_verstuurd} onClick={() => onToggle(r.id, 'gelangenbest_verstuurd')} /></td>
                <td className={styles.chk}><Cb aan={!!r.geld_van_lm} onClick={() => onToggle(r.id, 'geld_van_lm')} /></td>
                <td className={styles.chk}><Cb aan={!!r.geld_van_dealer} onClick={() => onToggle(r.id, 'geld_van_dealer')} /></td>
                <td style={{ fontWeight: 600, color: 'var(--green)', whiteSpace: 'nowrap' }}>{bedragFmt(r.bedrag)}</td>
                <td>
                  {dagen !== null ? (
                    <span className={`${styles.wachttijdChip} ${isLaat ? styles.laat : ''}`}>
                      {dagen}d
                    </span>
                  ) : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 160 }}>{r.opmerkingen || '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
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
function TabArchief({ records, zoek, onEdit }: {
  records: BtwRecord[];
  zoek: string;
  onEdit: (r: BtwRecord) => void;
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
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td style={{ fontWeight: 600 }}>{r.auto}</td>
              <td>{typeBadge(r.type)}</td>
              <td>{r.klant || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.dealer_verkoper || '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{datumFmt(r.ingekocht_op)}</td>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{bedragFmt(r.bedrag)}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>{r.opmerkingen || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────
export default function BtwPage() {
  const { records, loading, add, save, remove, toggle } = useBtw();
  const [tab, setTab] = useState<Tab>('lopend');
  const [zoek, setZoek] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BtwRecord | null>(null);

  function openEdit(r: BtwRecord) { setEditRecord(r); setModalOpen(true); }
  function openNieuw() { setEditRecord(null); setModalOpen(true); }

  async function handleOpslaan(rec: BtwRecord | Omit<BtwRecord, 'id' | 'created_at'>) {
    if ('id' in rec) await save(rec as BtwRecord);
    else await add(rec);
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

      <KpiStrip records={records} />

      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'lopend'  && <TabLopend  records={records} zoek={zoek} onEdit={openEdit} onToggle={toggle} onArchiveer={handleArchiveer} />}
          {tab === 'archief' && <TabArchief records={records} zoek={zoek} onEdit={openEdit} />}
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
