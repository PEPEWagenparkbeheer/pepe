'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLease } from '@/hooks/useLease';
import type { LeaseAanvraag, LeaseKlant } from '@/types';
import LeaseAkkoordModal from './LeaseAkkoordModal';
import LeaseKlantModal from './LeaseKlantModal';
import LeaseModal from './LeaseModal';
import styles from './LeasePage.module.css';

type Tab = 'aanvragen' | 'verkocht' | 'klanten';

// ── Helpers ───────────────────────────────────────────────────
function normSummary(r: LeaseAanvraag): string {
  const parts: string[] = [];
  if (r.looptijd) parts.push(`${r.looptijd} mnd`);
  if (r.jaarkilometrage) parts.push(`${parseInt(r.jaarkilometrage).toLocaleString('nl-NL')} km`);
  if (r.banden) parts.push(r.banden);
  if (r.eigen_risico) parts.push(`${r.eigen_risico} ER`);
  if (r.vervangend_vervoer) parts.push('✓ VV');
  if (r.brandstofvoorschot) parts.push('✓ BS');
  return parts.join(' · ') || '—';
}

function verdienSummary(r: LeaseAanvraag): { tekst: string; totaal: number } {
  const parts: string[] = [];
  if (r.verdiensten_lm) parts.push(`LM: €${r.verdiensten_lm.toLocaleString('nl-NL')}${r.verdiensten_lm_pct ? ` (${r.verdiensten_lm_pct}%)` : ''}`);
  if (r.verdiensten_dealer) parts.push(`Dealer: €${r.verdiensten_dealer.toLocaleString('nl-NL')}${r.verdiensten_dealer_pct ? ` (${r.verdiensten_dealer_pct}%)` : ''}`);
  return {
    tekst: parts.join(' + ') || '—',
    totaal: (r.verdiensten_lm ?? 0) + (r.verdiensten_dealer ?? 0),
  };
}

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}

function zoekMatch(r: LeaseAanvraag, q: string): boolean {
  return `${r.klant_naam} ${r.merk ?? ''} ${r.model ?? ''} ${r.inkoper ?? ''} ${r.leasemaatschappij ?? ''}`.toLowerCase().includes(q.toLowerCase());
}

function zoekMatchKlant(k: LeaseKlant, q: string): boolean {
  return k.naam.toLowerCase().includes(q.toLowerCase());
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ aanvragen }: { aanvragen: LeaseAanvraag[] }) {
  const lopend = aanvragen.filter((r) => !r.verkocht);
  const offerte = lopend.filter((r) => r.offerte_verstuurd).length;
  const akkoord = lopend.filter((r) => r.akkoord).length;
  const totaal = aanvragen.reduce((s, r) => s + (r.verdiensten_lm ?? 0) + (r.verdiensten_dealer ?? 0), 0);

  return (
    <div className={styles.kpiStrip}>
      <div className={`${styles.kpiCard} ${lopend.length > 0 ? styles.hot : ''}`}>
        <div className={styles.kpiIcoon}>📋</div>
        <div className={`${styles.kpiGetal} ${lopend.length > 0 ? styles.warn : ''}`}>{lopend.length}</div>
        <div className={styles.kpiLabel}>Lopende aanvragen</div>
      </div>
      <div className={`${styles.kpiCard} ${offerte > 0 ? styles.warn : ''}`}>
        <div className={styles.kpiIcoon}>📤</div>
        <div className={`${styles.kpiGetal} ${offerte > 0 ? styles.warn : ''}`}>{offerte}</div>
        <div className={styles.kpiLabel}>Offerte verstuurd</div>
      </div>
      <div className={`${styles.kpiCard} ${akkoord > 0 ? styles.good : ''}`}>
        <div className={styles.kpiIcoon}>✅</div>
        <div className={`${styles.kpiGetal} ${akkoord > 0 ? styles.ok : ''}`}>{akkoord}</div>
        <div className={styles.kpiLabel}>Akkoord gegeven</div>
      </div>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcoon}>💶</div>
        <div className={styles.kpiGetal} style={{ fontSize: totaal > 99999 ? 16 : 22 }}>
          {totaal > 0 ? `€ ${totaal.toLocaleString('nl-NL')}` : '—'}
        </div>
        <div className={styles.kpiLabel}>Totaal verdiensten</div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ r }: { r: LeaseAanvraag }) {
  if (r.akkoord) return <span className={`${styles.badge} ${styles.badgeAkkoord}`}>✓ Akkoord</span>;
  if (r.offerte_verstuurd) return <span className={`${styles.badge} ${styles.badgeOfferte}`}>📤 Offerte</span>;
  return <span className={`${styles.badge} ${styles.badgeNieuw}`}>In aanvraag</span>;
}

// ── Tab: Lopende aanvragen ────────────────────────────────────
function TabAanvragen({ aanvragen, zoek, onEdit, onAkkoord }: {
  aanvragen: LeaseAanvraag[];
  zoek: string;
  onEdit: (r: LeaseAanvraag) => void;
  onAkkoord: (r: LeaseAanvraag) => void;
}) {
  const rijen = aanvragen.filter((r) => !r.verkocht && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen lopende leaseaanvragen</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Klant / Berijder</th>
          <th>Merk / Model</th>
          <th>Norm</th>
          <th>Verdiensten</th>
          <th>Normbedrag</th>
          <th>Leasemaatschappij</th>
          <th>Inkoper</th>
          <th>Aangemaakt</th>
          <th>Status</th>
          <th>Actie</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const { tekst, totaal } = verdienSummary(r);
            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                <td>
                  <div className={styles.kn}>{r.klant_naam}</div>
                  {r.berijder && <div className={styles.ks}>{r.berijder}</div>}
                </td>
                <td>
                  <div className={styles.kn}>{r.merk}</div>
                  <div className={styles.ks}>{r.model}</div>
                </td>
                <td><div className={styles.normChip}>{normSummary(r)}</div></td>
                <td>
                  {totaal > 0 ? (
                    <div className={styles.verdiensten}>€ {totaal.toLocaleString('nl-NL')}</div>
                  ) : null}
                  <div className={styles.verdienstenMuted}>{tekst}</div>
                </td>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.leasetarief ? `€ ${r.leasetarief}/mnd` : r.leasenormbedrag ? `€ ${r.leasenormbedrag}/mnd` : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.leasemaatschappij || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.inkoper || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{datumFmt(r.created_at)}</td>
                <td><StatusBadge r={r} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  {!r.akkoord && (
                    <button className={styles.actieKnop} onClick={() => onAkkoord(r)}>✅ Akkoord</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Verkocht lease ───────────────────────────────────────
function TabVerkocht({ aanvragen, zoek, onEdit, onTerugzetten }: {
  aanvragen: LeaseAanvraag[];
  zoek: string;
  onEdit: (r: LeaseAanvraag) => void;
  onTerugzetten: (r: LeaseAanvraag) => void;
}) {
  const rijen = aanvragen
    .filter((r) => r.verkocht && (!zoek || zoekMatch(r, zoek)))
    .sort((a, b) => (b.verkocht_op ?? '') > (a.verkocht_op ?? '') ? 1 : -1);

  if (!rijen.length) return <div className={styles.leeg}>Nog geen verkochte lease</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Klant / Berijder</th>
          <th>Merk / Model</th>
          <th>Tarief</th>
          <th>Leasemaatschappij</th>
          <th>Verdiensten</th>
          <th>Verkocht op</th>
          <th>Inkoper</th>
          <th>Acties</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const { tekst, totaal } = verdienSummary(r);
            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                <td>
                  <div className={styles.kn}>{r.klant_naam}</div>
                  {r.berijder && <div className={styles.ks}>{r.berijder}</div>}
                </td>
                <td>
                  <div className={styles.kn}>{r.merk}</div>
                  <div className={styles.ks}>{r.model}</div>
                </td>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.leasetarief ? `€ ${r.leasetarief}/mnd` : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.leasemaatschappij || '—'}</td>
                <td>
                  {totaal > 0 && <div className={styles.verdiensten}>€ {totaal.toLocaleString('nl-NL')}</div>}
                  <div className={styles.verdienstenMuted}>{tekst}</div>
                </td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{datumFmt(r.verkocht_op)}</td>
                <td style={{ fontSize: 12 }}>{r.inkoper || '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className={styles.terugzetKnop} onClick={() => onTerugzetten(r)}>↩ Terugzetten</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Klanten / Normen ─────────────────────────────────────
function TabKlanten({ klanten, zoek, onEdit }: {
  klanten: LeaseKlant[];
  zoek: string;
  onEdit: (k: LeaseKlant) => void;
}) {
  const rijen = klanten.filter((k) => !zoek || zoekMatchKlant(k, zoek));
  if (!rijen.length) return <div className={styles.leeg}>Nog geen klanten / normen</div>;

  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Klantnaam</th>
          <th>Looptijd</th>
          <th>Jaarkilometrage</th>
          <th>Vervangend vervoer</th>
          <th>Banden</th>
          <th>Eigen risico</th>
          <th>Brandstofvoorschot</th>
          <th>Notities</th>
          <th></th>
        </tr></thead>
        <tbody>
          {rijen.map((k) => (
            <tr key={k.id} onClick={() => onEdit(k)}>
              <td><div className={styles.kn}>{k.naam}</div></td>
              <td>{k.looptijd ? `${k.looptijd} mnd` : '—'}</td>
              <td>{k.jaarkilometrage ? `${parseInt(k.jaarkilometrage).toLocaleString('nl-NL')} km` : '—'}</td>
              <td>{k.vervangend_vervoer ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Ja</span> : '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.banden || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.eigen_risico || '—'}</td>
              <td>{k.brandstofvoorschot ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Ja</span> : '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 180 }}>{k.notities || '—'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className={styles.terugzetKnop} style={{ borderColor: 'rgba(96,165,250,.3)', color: '#60a5fa' }} onClick={() => onEdit(k)}>
                  ✏ Bewerk
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
export default function LeasePage() {
  const { aanvragen, klanten, loading, addAanvraag, saveAanvraag, removeAanvraag, addKlant, saveKlant, removeKlant } = useLease();
  const [tab, setTab] = useState<Tab>('aanvragen');
  const [zoek, setZoek] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [klantModalOpen, setKlantModalOpen] = useState(false);
  const [akkoordModalOpen, setAkkoordModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<LeaseAanvraag | null>(null);
  const [editKlant, setEditKlant] = useState<LeaseKlant | null>(null);
  const [akkoordRecord, setAkkoordRecord] = useState<LeaseAanvraag | null>(null);

  function openEdit(r: LeaseAanvraag) { setEditRecord(r); setModalOpen(true); }
  function openNieuw() { setEditRecord(null); setModalOpen(true); }
  function openKlantEdit(k: LeaseKlant) { setEditKlant(k); setKlantModalOpen(true); }
  function openKlantNieuw() { setEditKlant(null); setKlantModalOpen(true); }
  function openAkkoord(r: LeaseAanvraag) { setAkkoordRecord(r); setAkkoordModalOpen(true); }

  async function handleOpslaan(rec: LeaseAanvraag | Omit<LeaseAanvraag, 'id' | 'created_at'>) {
    if ('id' in rec) await saveAanvraag(rec as LeaseAanvraag);
    else await addAanvraag(rec);
  }

  async function handleKlantOpslaan(rec: LeaseKlant | Omit<LeaseKlant, 'id' | 'created_at'>) {
    if ('id' in rec) await saveKlant(rec as LeaseKlant);
    else await addKlant(rec);
  }

  async function handleAkkoordBevestig(
    rec: LeaseAanvraag,
    { ookAfterSales, verwachteDatum }: { ookAfterSales: boolean; verwachteDatum: string }
  ) {
    const vandaag = new Date().toISOString().slice(0, 10);
    const bijgewerkt: LeaseAanvraag = {
      ...rec,
      akkoord: true,
      akkoord_datum: vandaag,
      verkocht: true,
      verkocht_op: vandaag,
      in_btw_lijst: true,
      verwachte_leverdatum: verwachteDatum || rec.verwachte_leverdatum,
    };
    await saveAanvraag(bijgewerkt);

    // Automatisch naar BTW/Credit lijst
    const btwRec = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      auto: `${rec.merk ?? ''} ${rec.model ?? ''}`.trim() || 'Lease auto',
      type: 'nieuw' as const,
      klant: rec.klant_naam,
      dealer_verkoper: rec.leasemaatschappij,
      ingekocht_op: vandaag,
      bedrag: (rec.verdiensten_lm ?? 0) + (rec.verdiensten_dealer ?? 0) || undefined,
      opmerkingen: `Lease verdiensten – ${rec.merk ?? ''} ${rec.model ?? ''}`.trim(),
      inkoper: rec.inkoper,
      gelangenbest_verstuurd: false,
      geld_van_lm: false,
      geld_van_dealer: false,
      gearchiveerd: false,
    };
    try { await supabase.from('btw_records').insert(btwRec); } catch { /* leeg */ }

    // Optioneel naar After Sales
    if (ookAfterSales) {
      const asRec = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        kenteken: 'NNB',
        merk: rec.merk ?? '',
        model: rec.model ?? '',
        klant: rec.klant_naam,
        type: 'nieuw' as const,
        notitie: `Lease: ${rec.leasemaatschappij || '—'} | Berijder: ${rec.berijder || '—'}`,
        afleverdatum: verwachteDatum || rec.verwachte_leverdatum,
        binnen: false,
        aflevercontrole: false,
        gearchiveerd: false,
      };
      try { await supabase.from('after_sales').insert(asRec); } catch { /* leeg */ }
    }
  }

  async function handleTerugzetten(rec: LeaseAanvraag) {
    await saveAanvraag({ ...rec, akkoord: false, verkocht: false, verkocht_op: undefined, in_btw_lijst: false });
  }

  const isKlantenTab = tab === 'klanten';

  return (
    <div className={styles.pagina}>
      <div className={styles.tabBalk}>
        <button className={`tab ${tab === 'aanvragen' ? 'on' : ''}`} onClick={() => setTab('aanvragen')}>📋 Lopende aanvragen</button>
        <button className={`tab ${tab === 'verkocht' ? 'on' : ''}`} onClick={() => setTab('verkocht')}>✅ Verkocht lease</button>
        <button className={`tab ${tab === 'klanten' ? 'on' : ''}`} onClick={() => setTab('klanten')}>👥 Klanten / Normen</button>
        <div className={styles.tabBalkRechts}>
          <input className={styles.zoekbalk} placeholder="Zoeken in lease..." value={zoek} onChange={(e) => setZoek(e.target.value)} />
          {isKlantenTab
            ? <button className="btn btn-a" onClick={openKlantNieuw}>+ Klant toevoegen</button>
            : <button className="btn btn-a" onClick={openNieuw}>+ Nieuwe aanvraag</button>
          }
        </div>
      </div>

      <KpiStrip aanvragen={aanvragen} />

      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'aanvragen' && <TabAanvragen aanvragen={aanvragen} zoek={zoek} onEdit={openEdit} onAkkoord={openAkkoord} />}
          {tab === 'verkocht'  && <TabVerkocht  aanvragen={aanvragen} zoek={zoek} onEdit={openEdit} onTerugzetten={handleTerugzetten} />}
          {tab === 'klanten'   && <TabKlanten   klanten={klanten} zoek={zoek} onEdit={openKlantEdit} />}
        </>
      )}

      <LeaseModal
        record={editRecord}
        klanten={klanten}
        open={modalOpen}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={removeAanvraag}
      />

      <LeaseKlantModal
        record={editKlant}
        open={klantModalOpen}
        onSluiten={() => setKlantModalOpen(false)}
        onOpslaan={handleKlantOpslaan}
        onVerwijder={removeKlant}
      />

      <LeaseAkkoordModal
        record={akkoordRecord}
        open={akkoordModalOpen}
        onSluiten={() => setAkkoordModalOpen(false)}
        onBevestig={handleAkkoordBevestig}
      />
    </div>
  );
}
