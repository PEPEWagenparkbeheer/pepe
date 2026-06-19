'use client';

import { useState } from 'react';
import { useFacturen } from '@/hooks/useFacturen';
import type { Factuur, FactuurStatus, Documenttype } from '@/types';
import FacturenModal from './FacturenModal';
import styles from './FacturenPage.module.css';

type Tab = 'actief' | 'archief';

const DOCUMENTTYPE_LABEL: Record<Documenttype, string> = {
  factuur: 'Factuur',
  bestelbevestiging: 'Bestelling',
  inzetbevestiging: 'Inzet',
  autokosten: 'Autokosten',
};

const DOCUMENTTYPE_ICOON: Record<Documenttype, string> = {
  factuur: '📄',
  bestelbevestiging: '🛒',
  inzetbevestiging: '🚗',
  autokosten: '🔧',
};

const STATUS_CSS: Record<FactuurStatus, string> = {
  nieuw:        styles.stNieuw,
  bewerkt:      styles.stBewerkt,
  goedgekeurd:  styles.stGoedgekeurd,
  genegeerd:    styles.stGenegeerd,
  gefaald:      styles.stGefaald,
};
const STATUS_LABEL: Record<FactuurStatus, string> = {
  nieuw:        'Nieuw',
  bewerkt:      'Bewerkt',
  goedgekeurd:  'In HubSpot',
  genegeerd:    'Genegeerd',
  gefaald:      'Mislukt',
};

function datumFmt(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}
function euroFmt(n?: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
function typeChip(dt?: Documenttype | null) {
  const type = dt ?? 'factuur';
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--faint)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      {DOCUMENTTYPE_ICOON[type]} {DOCUMENTTYPE_LABEL[type]}
    </span>
  );
}

function zoekMatch(r: Factuur, q: string): boolean {
  const blob = `${r.contractnummer ?? ''} ` +`${r.afzender ?? ''} ${r.onderwerp ?? ''} ${r.kenteken ?? ''} ${r.bedrijfsnaam ?? ''} ${r.berijder_naam ?? ''} ${r.factuurnummer ?? ''}`;
  return blob.toLowerCase().includes(q.toLowerCase());
}

function KpiStrip({ facturen }: { facturen: Factuur[] }) {
  const actief = facturen.filter((r) => !r.gearchiveerd);
  const nieuw = actief.filter((r) => r.status === 'nieuw').length;
  const bewerkt = actief.filter((r) => r.status === 'bewerkt').length;
  const goedgekeurd = facturen.filter((r) => r.status === 'goedgekeurd').length;
  const gefaald = actief.filter((r) => r.status === 'gefaald').length;

  return (
    <div className={styles.kpiStrip}>
      <div className={`${styles.kpiCard} ${nieuw > 0 ? styles.nieuw : ''}`}>
        <div className={styles.kpiIcoon}>📥</div>
        <div className={`${styles.kpiGetal} ${nieuw > 0 ? styles.blauw : ''}`}>{nieuw}</div>
        <div className={styles.kpiLabel}>Nieuw</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>✏️</div>
        <div className={styles.kpiGetal}>{bewerkt}</div>
        <div className={styles.kpiLabel}>Bewerkt</div>
      </div>
      <div className={`${styles.kpiCard} ${goedgekeurd > 0 ? styles.ok : ''}`}>
        <div className={styles.kpiIcoon}>✅</div>
        <div className={`${styles.kpiGetal} ${goedgekeurd > 0 ? styles.groen : ''}`}>{goedgekeurd}</div>
        <div className={styles.kpiLabel}>In HubSpot</div>
      </div>
      <div className={`${styles.kpiCard} ${gefaald > 0 ? styles.fout : ''}`}>
        <div className={styles.kpiIcoon}>⚠️</div>
        <div className={`${styles.kpiGetal} ${gefaald > 0 ? styles.rood : ''}`}>{gefaald}</div>
        <div className={styles.kpiLabel}>Mislukt</div>
      </div>
    </div>
  );
}

function TabActief({ facturen, zoek, typeFilter, onEdit, onAkkoord, onNegeer }: {
  facturen: Factuur[];
  zoek: string;
  typeFilter: string;
  onEdit: (r: Factuur) => void;
  onAkkoord: (r: Factuur) => void;
  onNegeer: (id: string) => void;
}) {
  const rijen = facturen
    .filter((r) => !r.gearchiveerd)
    .filter((r) => !zoek || zoekMatch(r, zoek))
    .filter((r) => !typeFilter || (r.documenttype ?? 'factuur') === typeFilter);

  if (!rijen.length) return <div className={styles.leeg}>Geen actieve documenten</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Type</th>
          <th>Status</th>
          <th>Factuurdatum</th>
          <th>Afzender</th>
          <th>Kenteken</th>
          <th>Bedrijf</th>
          <th>Berijder</th>
          <th>Bedrag</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const isBedrijf = r.is_bedrijf !== false;
            const klaar = !!r.kenteken && (isBedrijf ? !!r.bedrijfsnaam : !!r.berijder_naam);
            return (
              <tr
                key={r.id}
                className={
                  r.status === 'gefaald' ? styles.gefaaldRij
                  : r.status === 'nieuw' ? styles.nieuwRij : ''
                }
                onClick={() => onEdit(r)}
              >
                <td>{typeChip(r.documenttype)}</td>
                <td>
                  <span className={`${styles.badge} ${STATUS_CSS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  {r.hubspot_error && (
                    <div className={styles.foutTekst} title={r.hubspot_error}>{r.hubspot_error}</div>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{datumFmt(r.factuurdatum)}</td>
                <td style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{r.afzender ?? '—'}</div>
                  {r.factuurnummer && (
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>#{r.factuurnummer}</div>
                  )}
                </td>
                <td>
                  {r.kenteken ? <span className={styles.kentekenChip}>{r.kenteken}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td style={{ fontSize: 13 }}>{r.bedrijfsnaam ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>
                  {r.berijder_naam ?? '—'}
                  {r.berijder_email && (
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{r.berijder_email}</div>
                  )}
                </td>
                <td className={styles.bedragCel}>
                  <div>{euroFmt(r.bedrag_incl_btw)}</div>
                  {r.bedrag_excl_btw != null && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{euroFmt(r.bedrag_excl_btw)} ex</div>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className={styles.actiesRij}>
                    <button
                      className={styles.akkoordKnop}
                      disabled={!klaar}
                      title={klaar ? 'Wegschrijven naar HubSpot' : (isBedrijf ? 'Kenteken en bedrijfsnaam zijn verplicht' : 'Kenteken en berijder-naam zijn verplicht')}
                      onClick={(e) => { e.stopPropagation(); onAkkoord(r); }}
                    >
                      ✅ Akkoord
                    </button>
                    <button
                      className={styles.negeerKnop}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Document ${r.factuurnummer ?? r.contractnummer ?? r.onderwerp ?? ''} negeren en archiveren?`)) {
                          onNegeer(r.id);
                        }
                      }}
                    >
                      Negeer
                    </button>
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

function TabArchief({ facturen, zoek, typeFilter, onEdit, onTerugzetten }: {
  facturen: Factuur[];
  zoek: string;
  typeFilter: string;
  onEdit: (r: Factuur) => void;
  onTerugzetten: (r: Factuur) => void;
}) {
  const rijen = facturen
    .filter((r) => r.gearchiveerd)
    .filter((r) => !zoek || zoekMatch(r, zoek))
    .filter((r) => !typeFilter || (r.documenttype ?? 'factuur') === typeFilter);

  if (!rijen.length) return <div className={styles.leeg}>Archief is leeg</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Type</th>
          <th>Status</th>
          <th>Factuurdatum</th>
          <th>Afzender</th>
          <th>Kenteken</th>
          <th>Bedrijf</th>
          <th>Bedrag</th>
          <th>Naar HubSpot</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td>{typeChip(r.documenttype)}</td>
              <td><span className={`${styles.badge} ${STATUS_CSS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{datumFmt(r.factuurdatum)}</td>
              <td style={{ fontSize: 12, fontWeight: 600 }}>{r.afzender ?? '—'}</td>
              <td>{r.kenteken ? <span className={styles.kentekenChip}>{r.kenteken}</span> : '—'}</td>
              <td style={{ fontSize: 13 }}>{r.bedrijfsnaam ?? '—'}</td>
              <td className={styles.bedragCel}>{euroFmt(r.bedrag_incl_btw)}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{datumFmt(r.hubspot_synced_at)}</td>
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

export default function FacturenPage() {
  const { facturen, loading, gebruiker, save, akkoord, negeer, terugzetten, pdfUrl, reExtract } = useFacturen();
  const [tab, setTab] = useState<Tab>('actief');
  const [zoek, setZoek] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<Factuur | null>(null);

  function openEdit(r: Factuur) { setEdit(r); setModalOpen(true); }

  async function handleAkkoord(r: Factuur) {
    const klantLabel = r.is_bedrijf !== false
      ? `Bedrijf: ${r.bedrijfsnaam}`
      : `Particulier: ${r.berijder_naam}`;
    if (!window.confirm(`Document ${r.factuurnummer ?? r.contractnummer ?? ''} wegschrijven naar HubSpot?\n\nKenteken: ${r.kenteken ?? '—'}\n${klantLabel}`)) return;
    const res = await akkoord(r.id);
    if (!res.ok) alert('HubSpot-fout: ' + res.error);
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.tabBalk}>
        <button className={`tab ${tab === 'actief' ? 'on' : ''}`} onClick={() => setTab('actief')}>Actief</button>
        <button className={`tab ${tab === 'archief' ? 'on' : ''}`} onClick={() => setTab('archief')}>Archief</button>
        <div className={styles.tabBalkRechts}>
          <input
            className={styles.zoekbalk}
            placeholder="Zoeken (kenteken, contractnr, bedrijf, afzender)..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 12px 0', flexWrap: 'wrap' }}>
        <button className={`tab ${!typeFilter ? 'on' : ''}`} style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setTypeFilter('')}>Alle</button>
        {(['factuur', 'bestelbevestiging', 'inzetbevestiging', 'autokosten'] as const).map((t) => (
          <button key={t} className={`tab ${typeFilter === t ? 'on' : ''}`} style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setTypeFilter(t)}>
            {DOCUMENTTYPE_ICOON[t]} {DOCUMENTTYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <KpiStrip facturen={facturen} />

      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : tab === 'actief' ? (
        <TabActief
          facturen={facturen}
          zoek={zoek}
          typeFilter={typeFilter}
          onEdit={openEdit}
          onAkkoord={handleAkkoord}
          onNegeer={negeer}
        />
      ) : (
        <TabArchief
          facturen={facturen}
          zoek={zoek}
          typeFilter={typeFilter}
          onEdit={openEdit}
          onTerugzetten={terugzetten}
        />
      )}

      <FacturenModal
        factuur={edit}
        open={modalOpen}
        gebruiker={gebruiker}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={save}
        onAkkoord={async (r) => {
          const res = await akkoord(r.id);
          if (!res.ok) alert('HubSpot-fout: ' + res.error);
          else setModalOpen(false);
        }}
        onPdfUrl={pdfUrl}
        onReExtract={reExtract}
      />
    </div>
  );
}
