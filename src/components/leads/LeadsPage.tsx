'use client';

import { useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import type { Lead, LeadBron, LeadStatus } from '@/types';
import LeadsModal from './LeadsModal';
import styles from './LeadsPage.module.css';

type Tab = 'actief' | 'archief';

// ── Helpers ───────────────────────────────────────────────────
const BRON_CSS: Record<LeadBron, string> = {
  autoscout24: styles.bronAs24,
  autowereld:  styles.bronAutowereld,
  marktplaats: styles.bronMp,
  email:       styles.bronEmail,
  anders:      styles.bronAnders,
};
const BRON_LABEL: Record<LeadBron, string> = {
  autoscout24: 'AutoScout24',
  autowereld:  'Autowereld',
  marktplaats: 'Marktplaats',
  email:       'E-mail',
  anders:      'Anders',
};

const STATUS_CSS: Record<LeadStatus, string> = {
  nieuw:          styles.stNieuw,
  opgepakt:       styles.stOppepakt,
  gebeld:         styles.stGebeld,
  interesse:      styles.stInteresse,
  verkocht:       styles.stVerkocht,
  geen_interesse: styles.stGeenInteresse,
};
const STATUS_LABEL: Record<LeadStatus, string> = {
  nieuw:          'Nieuw',
  opgepakt:       'Opgepakt',
  gebeld:         'Gebeld',
  interesse:      'Interesse',
  verkocht:       'Verkocht',
  geen_interesse: 'Geen interesse',
};

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}

function zoekMatch(r: Lead, q: string): boolean {
  return `${r.klant_naam} ${r.email ?? ''} ${r.auto} ${r.wie ?? ''} ${r.vervolgactie ?? ''}`.toLowerCase().includes(q.toLowerCase());
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ leads }: { leads: Lead[] }) {
  const actief = leads.filter((r) => !r.gearchiveerd);
  const nu = new Date();
  const dezeM = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}`;

  const nieuw     = actief.filter((r) => r.status === 'nieuw').length;
  const inBeh     = actief.filter((r) => r.status === 'opgepakt' || r.status === 'gebeld').length;
  const verkochtM = leads.filter((r) => r.status === 'verkocht' && (r.veld_meta?.verkocht?.op ?? r.created_at ?? '').startsWith(dezeM)).length;

  return (
    <div className={styles.kpiStrip}>
      <div className={`${styles.kpiCard} ${nieuw > 0 ? styles.nieuw : ''}`}>
        <div className={styles.kpiIcoon}>🔵</div>
        <div className={`${styles.kpiGetal} ${nieuw > 0 ? styles.blauw : ''}`}>{nieuw}</div>
        <div className={styles.kpiLabel}>Nieuw</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>📞</div>
        <div className={styles.kpiGetal}>{inBeh}</div>
        <div className={styles.kpiLabel}>In behandeling</div>
      </div>
      <div className={`${styles.kpiCard} ${verkochtM > 0 ? styles.ok : ''}`}>
        <div className={styles.kpiIcoon}>✅</div>
        <div className={`${styles.kpiGetal} ${verkochtM > 0 ? styles.groen : ''}`}>{verkochtM}</div>
        <div className={styles.kpiLabel}>Verkocht deze maand</div>
      </div>
    </div>
  );
}

// ── Tabel: Actief ─────────────────────────────────────────────
function TabActief({ leads, zoek, statusFilter, onEdit, onOppakken, onArchiveer }: {
  leads: Lead[];
  zoek: string;
  statusFilter: string;
  onEdit: (r: Lead) => void;
  onOppakken: (id: string) => void;
  onArchiveer: (id: string) => void;
}) {
  const rijen = leads
    .filter((r) => !r.gearchiveerd)
    .filter((r) => !zoek || zoekMatch(r, zoek))
    .filter((r) => !statusFilter || r.status === statusFilter);

  if (!rijen.length) return <div className={styles.leeg}>Geen actieve leads</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Bron</th>
          <th>Klant</th>
          <th>Auto</th>
          <th>Wie</th>
          <th>Status</th>
          <th>Vervolgactie</th>
          <th>Binnenkomst</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr
              key={r.id}
              className={r.status === 'nieuw' ? styles.nieuwRij : r.status === 'verkocht' ? styles.verkochtRij : ''}
              onClick={() => onEdit(r)}
            >
              <td>
                <span className={`${styles.badge} ${BRON_CSS[r.bron]}`}>{BRON_LABEL[r.bron]}</span>
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.klant_naam}</div>
                {r.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{r.email}</div>}
                {r.telefoon && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.telefoon}</div>}
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.auto}</div>
                {r.advertentie_url && (
                  <a
                    className={styles.advertentieLink}
                    href={r.advertentie_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 Advertentie
                  </a>
                )}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                {r.wie ? (
                  <span className={styles.wieName}>{r.wie}</span>
                ) : (
                  <button className={styles.oppakkenKnop} onClick={() => onOppakken(r.id)}>
                    Oppakken →
                  </button>
                )}
              </td>
              <td>
                <span className={`${styles.badge} ${STATUS_CSS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                {(r.status === 'opgepakt' || r.status === 'gebeld') && r.created_at && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)}d
                  </div>
                )}
              </td>
              <td style={{ fontSize: 12 }}>
                {r.vervolgactie ? (
                  <>
                    <div>{r.vervolgactie}</div>
                    {r.vervolgdatum && <div style={{ color: 'var(--muted)', marginTop: 1 }}>{datumFmt(r.vervolgdatum)}</div>}
                  </>
                ) : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>
                {datumFmt(r.created_at)}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className={styles.actiesRij}>
                  <button className={styles.archiefKnop} onClick={() => onArchiveer(r.id)}>
                    ✓ Archief
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabel: Archief ────────────────────────────────────────────
function TabArchief({ leads, zoek, onEdit, onTerugzetten }: {
  leads: Lead[];
  zoek: string;
  onEdit: (r: Lead) => void;
  onTerugzetten: (r: Lead) => void;
}) {
  const rijen = leads
    .filter((r) => r.gearchiveerd)
    .filter((r) => !zoek || zoekMatch(r, zoek));

  if (!rijen.length) return <div className={styles.leeg}>Archief is leeg</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Bron</th>
          <th>Klant</th>
          <th>Auto</th>
          <th>Wie</th>
          <th>Status</th>
          <th>Binnenkomst</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td>
                <span className={`${styles.badge} ${BRON_CSS[r.bron]}`}>{BRON_LABEL[r.bron]}</span>
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.klant_naam}</div>
                {r.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{r.email}</div>}
                {r.telefoon && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.telefoon}</div>}
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.auto}</div>
                {r.advertentie_url && (
                  <a
                    className={styles.advertentieLink}
                    href={r.advertentie_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 Advertentie
                  </a>
                )}
              </td>
              <td style={{ fontSize: 12 }}>{r.wie || '—'}</td>
              <td>
                <span className={`${styles.badge} ${STATUS_CSS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>
                {datumFmt(r.created_at)}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onTerugzetten(r)}>
                  ↩ Terugzetten
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────
export default function LeadsPage() {
  const { leads, loading, gebruiker, add, save, remove, archiveer, oppakken } = useLeads();
  const [tab, setTab] = useState<Tab>('actief');
  const [zoek, setZoek] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  function openEdit(r: Lead) { setEditLead(r); setModalOpen(true); }
  function openNieuw() { setEditLead(null); setModalOpen(true); }

  async function handleOpslaan(rec: Lead | Omit<Lead, 'id' | 'created_at'>) {
    if ('id' in rec) await save(rec as Lead);
    else await add(rec);
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.tabBalk}>
        <button className={`tab ${tab === 'actief'  ? 'on' : ''}`} onClick={() => setTab('actief')}>Actief</button>
        <button className={`tab ${tab === 'archief' ? 'on' : ''}`} onClick={() => setTab('archief')}>Archief</button>
        <div className={styles.tabBalkRechts}>
          <input
            className={styles.zoekbalk}
            placeholder="Zoeken..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
          <select className={styles.statusFilter} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Alle statussen</option>
            <option value="nieuw">Nieuw</option>
            <option value="opgepakt">Opgepakt</option>
            <option value="gebeld">Gebeld</option>
            <option value="interesse">Interesse</option>
            <option value="verkocht">Verkocht</option>
            <option value="geen_interesse">Geen interesse</option>
          </select>
          <button className="btn btn-a" onClick={openNieuw}>+ Lead toevoegen</button>
        </div>
      </div>

      <KpiStrip leads={leads} />

      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'actief' && (
            <TabActief
              leads={leads}
              zoek={zoek}
              statusFilter={statusFilter}
              onEdit={openEdit}
              onOppakken={oppakken}
              onArchiveer={archiveer}
            />
          )}
          {tab === 'archief' && (
            <TabArchief
              leads={leads}
              zoek={zoek}
              onEdit={openEdit}
              onTerugzetten={(r) => save({ ...r, gearchiveerd: false })}
            />
          )}
        </>
      )}

      <LeadsModal
        lead={editLead}
        open={modalOpen}
        gebruiker={gebruiker}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={remove}
      />
    </div>
  );
}
