'use client';

import { useMemo, useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import type { AfterSalesAuto, ASKlacht } from '@/types';
import AfterSalesModal from './AfterSalesModal';
import styles from './AfterSalesPage.module.css';

type HoofdTab = 'lopend' | 'import' | 'rijklaar' | 'gepland' | 'nalevering' | 'archief';
type NalTab = 'open' | 'opgelost';

// ── Helpers ───────────────────────────────────────────────────
function Cb({ aan, onClick }: { aan: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

function importVoortgang(r: AfterSalesAuto): number {
  const stappen = ['aangevraagd','betaald','binnen','rdw_ingeschreven','bpm_ingediend','bpm_goedgekeurd','bin_ontvangen','kentekenbewijzen','gelangenbest'] as const;
  const aan = stappen.filter((k) => r[k]).length;
  return Math.round((aan / stappen.length) * 100);
}

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }); } catch { return d; }
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ autos, klachten }: { autos: AfterSalesAuto[]; klachten: ASKlacht[] }) {
  const actief = autos.filter((r) => !r.gearchiveerd).length;
  const klaar  = autos.filter((r) => r.klaar && !r.gearchiveerd).length;
  const gepland = autos.filter((r) => r.afleverdatum && !r.gearchiveerd).length;
  const imports = autos.filter((r) => r.type === 'import' && !r.gearchiveerd).length;
  const openKlachten = klachten.filter((k) => k.status === 'open').length;
  const archief = autos.filter((r) => r.gearchiveerd).length;

  const kaarten = [
    { icoon: '🚗', getal: actief, label: 'Actief' },
    { icoon: '✅', getal: klaar, label: 'Rijklaar', kleur: klaar > 0 ? 'ok' : '' },
    { icoon: '📅', getal: gepland, label: 'Gepland' },
    { icoon: '🌍', getal: imports, label: 'Import' },
    { icoon: '⚠️', getal: openKlachten, label: 'Klachten', kleur: openKlachten > 0 ? 'warn' : '' },
    { icoon: '📦', getal: archief, label: 'Archief' },
  ];

  return (
    <div className={`${styles.kpiStrip} ${styles.col7}`} style={{ gridTemplateColumns: `repeat(${kaarten.length}, 1fr)` }}>
      {kaarten.map(({ icoon, getal, label, kleur }) => (
        <div key={label} className={styles.kpiCard}>
          <div className={styles.kpiIcoon}>{icoon}</div>
          <div className={`${styles.kpiGetal} ${kleur ? styles[kleur as 'warn' | 'ok'] : ''}`}>{getal}</div>
          <div className={styles.kpiLabel}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: In behandeling ───────────────────────────────────────
function TabLopend({ autos, zoek, onEdit, onToggle }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen auto's in behandeling</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th><th>Platen</th>
          <th className={styles.chk}>Binnen</th><th className={styles.chk}>Aflctr.</th>
          <th>Afleverdatum</th><th>Wie levert af</th><th>Status</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td><div className={styles.kn}>{r.kenteken}</div></td>
              <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
              <td>{r.klant}</td>
              <td>{r.type ? <span className={styles.badge + ' ' + styles.badgeNieuw}>{r.type}</span> : '—'}</td>
              <td>{r.platen || '—'}</td>
              <td className={styles.chk}><Cb aan={!!r.binnen} onClick={() => onToggle(r.id, 'binnen')} /></td>
              <td className={styles.chk}><Cb aan={!!r.aflevercontrole} onClick={() => onToggle(r.id, 'aflevercontrole')} /></td>
              <td>{datumFmt(r.afleverdatum)}</td>
              <td>{r.wie_levert_af || '—'}</td>
              <td>
                {r.klaar
                  ? <span className={`${styles.badge} ${styles.badgeKlaar}`}>Rijklaar</span>
                  : r.binnen
                    ? <span className={`${styles.badge} ${styles.badgeBezig}`}>In verwerking</span>
                    : <span className={`${styles.badge} ${styles.badgeNieuw}`}>Verwacht</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Import checklist ─────────────────────────────────────
const IMPORT_STAPPEN: { veld: keyof AfterSalesAuto; label: string }[] = [
  { veld: 'aangevraagd', label: 'Aangevr.' },
  { veld: 'betaald', label: 'Betaald' },
  { veld: 'binnen', label: 'Binnen' },
  { veld: 'rdw_ingeschreven', label: 'RDW' },
  { veld: 'bpm_ingediend', label: 'BPM ingd.' },
  { veld: 'bpm_goedgekeurd', label: 'BPM goedg.' },
  { veld: 'bin_ontvangen', label: 'BIN' },
  { veld: 'kentekenbewijzen', label: 'Kentekenbew.' },
  { veld: 'gelangenbest', label: 'Gelangenbest.' },
];

function TabImport({ autos, zoek, onEdit, onToggle }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => r.type === 'import' && !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen importauto's</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th>
          {IMPORT_STAPPEN.map((s) => <th key={s.veld} className={styles.chk}>{s.label}</th>)}
          <th>Voortgang</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const pct = importVoortgang(r);
            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                <td><div className={styles.kn}>{r.kenteken}</div></td>
                <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
                <td>{r.klant}</td>
                {IMPORT_STAPPEN.map((s) => (
                  <td key={s.veld} className={styles.chk}>
                    <Cb aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} />
                  </td>
                ))}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className={styles.voortgang} style={{ flex: 1 }}>
                      <div className={styles.voortgangBalk} style={{ width: pct + '%' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Rijklaar maken ───────────────────────────────────────
const RIJKLAAR_STAPPEN: { veld: keyof AfterSalesAuto; label: string }[] = [
  { veld: 'binnen', label: 'Binn.' },
  { veld: 'proefrit', label: 'Proef' },
  { veld: 'aflevercontrole', label: 'Aflctr.' },
  { veld: 'klaar', label: 'Klaar' },
];

function TabRijklaar({ autos, zoek, onEdit, onToggle }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen auto's</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th><th>Wie</th>
          {RIJKLAAR_STAPPEN.map((s) => <th key={s.veld} className={styles.chk}>{s.label}</th>)}
          <th>Platen</th><th>APK</th><th>Terugroep</th><th>Acc. + Mwrk</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td><div className={styles.kn}>{r.kenteken}</div></td>
              <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
              <td>{r.klant}</td>
              <td>{r.type || '—'}</td>
              <td>{r.wie_rijklaar || r.wie_levert_af || '—'}</td>
              {RIJKLAAR_STAPPEN.map((s) => (
                <td key={s.veld} className={styles.chk}>
                  <Cb aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} />
                </td>
              ))}
              <td>{r.platen || '—'}</td>
              <td>{r.apk || '—'}</td>
              <td>{r.terugroep || '—'}</td>
              <td>{r.accessoires || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Geplande afleveringen ────────────────────────────────
const AFLEVERING_CHECKS: { veld: keyof AfterSalesAuto; label: string }[] = [
  { veld: 'factuur', label: 'Factuur' },
  { veld: 'poetsen', label: 'Poetsen' },
  { veld: 'hubspot', label: 'HubSpot' },
];

function TabGepland({ autos, zoek, onEdit, onToggle }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
}) {
  const rijen = autos
    .filter((r) => r.afleverdatum && !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)))
    .sort((a, b) => (a.afleverdatum ?? '') < (b.afleverdatum ?? '') ? -1 : 1);
  if (!rijen.length) return <div className={styles.leeg}>Geen geplande afleveringen</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th>
          <th>Afleverdatum</th><th>Wie levert af</th>
          {AFLEVERING_CHECKS.map((s) => <th key={s.veld} className={styles.chk}>{s.label}</th>)}
          <th>Taken / notitie</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td><div className={styles.kn}>{r.kenteken}</div></td>
              <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
              <td>{r.klant}</td>
              <td>{r.type || '—'}</td>
              <td style={{ fontWeight: 600 }}>{datumFmt(r.afleverdatum)}</td>
              <td>{r.wie_levert_af || '—'}</td>
              {AFLEVERING_CHECKS.map((s) => (
                <td key={s.veld} className={styles.chk}>
                  <Cb aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} />
                </td>
              ))}
              <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 180 }}>{r.taken_notitie || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Nalevering / Klachten ────────────────────────────────
function TabNalevering({ klachten, autos, zoek, onAddKlacht, onUpdateKlacht, onRemoveKlacht }: {
  klachten: ASKlacht[]; autos: AfterSalesAuto[]; zoek: string;
  onAddKlacht: (k: Omit<ASKlacht, 'id' | 'created_at'>) => Promise<unknown>;
  onUpdateKlacht: (k: ASKlacht) => Promise<void>;
  onRemoveKlacht: (id: string) => Promise<void>;
}) {
  const [nalTab, setNalTab] = useState<NalTab>('open');
  const [klachtModal, setKlachtModal] = useState(false);
  const [editKlacht, setEditKlacht] = useState<ASKlacht | null>(null);
  const [klachtForm, setKlachtForm] = useState({ kenteken: '', merk_model: '', klant: '', omschrijving: '', oplossing: '', door_wie: '' });

  function openNieuw() { setEditKlacht(null); setKlachtForm({ kenteken: '', merk_model: '', klant: '', omschrijving: '', oplossing: '', door_wie: '' }); setKlachtModal(true); }
  function openEdit(k: ASKlacht) { setEditKlacht(k); setKlachtForm({ kenteken: k.kenteken, merk_model: k.merk_model ?? '', klant: k.klant ?? '', omschrijving: k.omschrijving, oplossing: k.oplossing ?? '', door_wie: k.door_wie ?? '' }); setKlachtModal(true); }

  async function handleOpslaan() {
    if (!klachtForm.kenteken || !klachtForm.omschrijving) { alert('Vul kenteken en omschrijving in.'); return; }
    if (editKlacht) {
      await onUpdateKlacht({ ...editKlacht, ...klachtForm });
    } else {
      await onAddKlacht({ ...klachtForm, auto_id: '', status: 'open' });
    }
    setKlachtModal(false);
  }

  async function handleOplossen(k: ASKlacht) {
    await onUpdateKlacht({ ...k, status: 'opgelost', opgelost_op: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) });
  }

  const gefilterdeKlachten = klachten
    .filter((k) => k.status === nalTab && (!zoek || `${k.kenteken} ${k.klant} ${k.omschrijving}`.toLowerCase().includes(zoek.toLowerCase())));

  return (
    <>
      <div className={styles.nalTabBalk}>
        <button className={`tab ${nalTab === 'open' ? 'on' : ''}`} onClick={() => setNalTab('open')}>Open klachten</button>
        <button className={`tab ${nalTab === 'opgelost' ? 'on' : ''}`} onClick={() => setNalTab('opgelost')}>✅ Opgelost</button>
        <div style={{ marginLeft: 'auto', padding: '8px 0' }}>
          <button className="btn btn-a" onClick={openNieuw}>+ Klacht toevoegen</button>
        </div>
      </div>

      {gefilterdeKlachten.length === 0 ? (
        <div className={styles.leeg}>Geen {nalTab === 'open' ? 'open klachten' : 'opgeloste klachten'}</div>
      ) : (
        <div className={styles.tabelWrapper}>
          <table className={styles.tabel}>
            <thead><tr>
              <th>Kenteken</th><th>Merk / Model</th><th>Klant</th>
              <th>Omschrijving</th><th>Oplossing</th>
              {nalTab === 'open' ? <><th>Door wie</th><th>Acties</th></> : <><th>Opgelost op</th><th>Door wie</th></>}
            </tr></thead>
            <tbody>
              {gefilterdeKlachten.map((k) => (
                <tr key={k.id} onClick={() => openEdit(k)}>
                  <td><div className={styles.kn}>{k.kenteken}</div></td>
                  <td>{k.merk_model || '—'}</td>
                  <td>{k.klant || '—'}</td>
                  <td style={{ maxWidth: 200 }}>{k.omschrijving}</td>
                  <td style={{ maxWidth: 180, color: 'var(--muted)', fontSize: 12 }}>{k.oplossing || '—'}</td>
                  {nalTab === 'open' ? (
                    <>
                      <td>{k.door_wie || '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleOplossen(k)}>✅ Oplossen</button>
                      </td>
                    </>
                  ) : (
                    <><td>{k.opgelost_op || '—'}</td><td>{k.door_wie || '—'}</td></>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Klacht modal */}
      {klachtModal && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setKlachtModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitel}>{editKlacht ? 'Klacht bewerken' : 'Klacht toevoegen'}</div>
              <button className={styles.sluitKnop} onClick={() => setKlachtModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.fg}><label>Kenteken *</label><input className="fi" value={klachtForm.kenteken} onChange={(e) => setKlachtForm((f) => ({ ...f, kenteken: e.target.value.toUpperCase() }))} /></div>
              <div className={styles.fg}><label>Klant</label><input className="fi" value={klachtForm.klant} onChange={(e) => setKlachtForm((f) => ({ ...f, klant: e.target.value }))} /></div>
              <div className={`${styles.fg} ${styles.vol}`}><label>Merk / Model</label><input className="fi" value={klachtForm.merk_model} onChange={(e) => setKlachtForm((f) => ({ ...f, merk_model: e.target.value }))} /></div>
              <div className={`${styles.fg} ${styles.vol}`}><label>Omschrijving *</label><textarea className="fi" rows={2} value={klachtForm.omschrijving} onChange={(e) => setKlachtForm((f) => ({ ...f, omschrijving: e.target.value }))} /></div>
              <div className={`${styles.fg} ${styles.vol}`}><label>Oplossing</label><textarea className="fi" rows={2} value={klachtForm.oplossing} onChange={(e) => setKlachtForm((f) => ({ ...f, oplossing: e.target.value }))} /></div>
              <div className={styles.fg}><label>Door wie</label><input className="fi" value={klachtForm.door_wie} onChange={(e) => setKlachtForm((f) => ({ ...f, door_wie: e.target.value }))} /></div>
            </div>
            <div className={styles.modalFooter}>
              {editKlacht && <button className={styles.verwijderKnop} onClick={async () => { await onRemoveKlacht(editKlacht.id); setKlachtModal(false); }}>🗑 Verwijder</button>}
              <button className="btn" onClick={() => setKlachtModal(false)}>Annuleer</button>
              <button className="btn btn-a" onClick={handleOpslaan}>Opslaan</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab: Archief ──────────────────────────────────────────────
function TabArchief({ autos, zoek, onEdit }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Archief is leeg</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th>
          <th>Afgeleverd op</th><th>Wie heeft afgeleverd</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td><div className={styles.kn}>{r.kenteken}</div></td>
              <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
              <td>{r.klant}</td>
              <td>{r.type || '—'}</td>
              <td>{datumFmt(r.afgeleverd_op)}</td>
              <td>{r.wie_heeft_afgeleverd || r.wie_levert_af || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Zoekhelper ────────────────────────────────────────────────
function zoekMatch(r: AfterSalesAuto, q: string): boolean {
  const lower = q.toLowerCase();
  return `${r.kenteken} ${r.merk} ${r.model} ${r.klant}`.toLowerCase().includes(lower);
}

// ── Hoofdpagina ───────────────────────────────────────────────
export default function AfterSalesPage() {
  const { autos, klachten, loading, addAuto, updateAuto, removeAuto, toggleAuto, addKlacht, updateKlacht, removeKlacht } = useAfterSales();
  const [tab, setTab] = useState<HoofdTab>('lopend');
  const [zoek, setZoek] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AfterSalesAuto | null>(null);

  const TABS: { k: HoofdTab; l: string }[] = [
    { k: 'lopend', l: 'In behandeling' },
    { k: 'import', l: 'Import checklist' },
    { k: 'rijklaar', l: 'Rijklaar maken' },
    { k: 'gepland', l: '📅 Geplande afleveringen' },
    { k: 'nalevering', l: 'Nalevering / Klachten' },
    { k: 'archief', l: 'Archief' },
  ];

  function openEdit(r: AfterSalesAuto) { setEditRecord(r); setModalOpen(true); }
  function openNieuw() { setEditRecord(null); setModalOpen(true); }

  async function handleOpslaan(rec: AfterSalesAuto | Omit<AfterSalesAuto, 'id' | 'created_at'>) {
    if ('id' in rec) await updateAuto(rec as AfterSalesAuto);
    else await addAuto(rec);
  }

  const actiefCount = useMemo(() => autos.filter((r) => !r.gearchiveerd).length, [autos]);

  return (
    <div className={styles.pagina}>
      {/* Sub-tab balk */}
      <div className={styles.subTabBalk}>
        {TABS.map(({ k, l }) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
        <div className={styles.subTabBalkRechts}>
          <input className={styles.zoekbalk} placeholder="Zoeken in after sales..." value={zoek} onChange={(e) => setZoek(e.target.value)} />
          {tab !== 'nalevering' && tab !== 'archief' && (
            <button className="btn btn-a" onClick={openNieuw}>+ Auto toevoegen</button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip autos={autos} klachten={klachten} />

      {/* Tab inhoud */}
      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'lopend'    && <TabLopend    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} />}
          {tab === 'import'   && <TabImport    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} />}
          {tab === 'rijklaar' && <TabRijklaar  autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} />}
          {tab === 'gepland'  && <TabGepland   autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} />}
          {tab === 'nalevering' && <TabNalevering klachten={klachten} autos={autos} zoek={zoek} onAddKlacht={addKlacht} onUpdateKlacht={updateKlacht} onRemoveKlacht={removeKlacht} />}
          {tab === 'archief'  && <TabArchief   autos={autos} zoek={zoek} onEdit={openEdit} />}
        </>
      )}

      {/* Modal */}
      <AfterSalesModal
        record={editRecord}
        open={modalOpen}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={removeAuto}
      />
    </div>
  );
}
