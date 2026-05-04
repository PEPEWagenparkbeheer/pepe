'use client';

'use client';

import { useMemo, useRef, useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import { schietConfetti } from '@/lib/confetti';
import type { AfterSalesAuto, ASAutoType, ASKlacht } from '@/types';
import KentekenPlaat from './KentekenPlaat';
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

function vandaagStr() {
  return new Date().toISOString().slice(0, 10);
}

function apkKleur(apkDatum?: string): 'groen' | 'oranje' | 'rood' | '' {
  if (!apkDatum) return '';
  const maanden = (new Date(apkDatum).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.5);
  if (maanden > 9) return 'groen';
  if (maanden > 6) return 'oranje';
  return 'rood';
}

const TYPE_CSS: Record<ASAutoType, string> = {
  import:   styles.tpImport,
  nl:       styles.tpNl,
  nieuw:    styles.tpNieuw,
  voorraad: styles.tpVoorraad,
};
const TYPE_LABEL: Record<ASAutoType, string> = {
  import:   '🌍 Import',
  nl:       '🇳🇱 NL',
  nieuw:    '✨ Nieuw',
  voorraad: '🏢 Voorraad',
};

async function rdwOphalen(kenteken: string): Promise<{ apk?: string; terugroep?: string }> {
  const k = kenteken.replace(/-/g, '').toUpperCase();
  try {
    const [voertuigRes, terugroepRes] = await Promise.all([
      fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${k}`),
      fetch(`https://opendata.rdw.nl/resource/t49b-isb7.json?kenteken=${k}`),
    ]);
    const [voertuig, recalls] = await Promise.all([voertuigRes.json(), terugroepRes.json()]);
    const apkRaw = voertuig[0]?.vervaldatum_apk_dt ?? voertuig[0]?.vervaldatum_apk;
    const apk = apkRaw ? new Date(apkRaw).toISOString().slice(0, 10) : undefined;
    const openRecalls = (recalls as { referentiecode_rdw?: string }[]).filter((r) => r.referentiecode_rdw);
    const terugroep = openRecalls.length === 0 ? 'geen' : openRecalls.map((r) => r.referentiecode_rdw).join(', ');
    return { apk, terugroep };
  } catch { return {}; }
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

// ── Mail aflevering ───────────────────────────────────────────
function mailAflevering(r: AfterSalesAuto, datum: string, tijdstip: string, factuur: boolean, poetsen: boolean, hubspot: boolean, bijzonderheden: string) {
  const to = factuur
    ? 'roger@pepewagenparkbeheer.nl;lorenzo@pepewagenparkbeheer.nl;perke@pepewagenparkbeheer.nl'
    : 'roger@pepewagenparkbeheer.nl;lorenzo@pepewagenparkbeheer.nl';
  const sub = encodeURIComponent(`Aflevering gepland – ${r.klant ?? ''} / ${r.merk ?? ''} ${r.model ?? ''}`);
  const taken = [factuur && '📋 Factuur maken', poetsen && '🧹 Poetsen', hubspot && '🟠 In HubSpot zetten'].filter(Boolean).join('\n- ');
  const body = encodeURIComponent(
    `Hallo Roger en Lorenzo,\n\nEr is een aflevering gepland:\n\n` +
    `Klant: ${r.klant ?? '—'}\nAuto: ${r.merk ?? ''} ${r.model ?? ''} (${r.kenteken})\n` +
    `Datum: ${datum}${tijdstip ? ` om ${tijdstip}` : ''}\n` +
    (taken ? `\nTe doen:\n- ${taken}\n` : '') +
    (bijzonderheden ? `\nBijzonderheden:\n${bijzonderheden}\n` : '') +
    `\nMet vriendelijke groet,\nPEPE Flow`
  );
  window.open(`mailto:${to}?subject=${sub}&body=${body}`);
}

// ── Tab: In behandeling ───────────────────────────────────────
function TabLopend({ autos, zoek, onEdit, onToggle, onAfleveren }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
  onAfleveren: (r: AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen auto's in behandeling</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel} style={{ minWidth: 1000 }}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th><th>Platen</th>
          <th className={styles.chk}>Binnen</th><th className={styles.chk}>Aflevercontr.</th>
          <th>Afleverdatum</th><th>Wie levert af</th><th>Status</th><th>Acties</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const rijklaarDot = r.klaar ? styles.dotGroen : (r.binnen && r.proefrit) ? styles.dotOranje : styles.dotRood;
            const importDot = r.bin_ontvangen ? styles.dotGroen : styles.dotOranje;
            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                <td><KentekenPlaat kenteken={r.kenteken} /></td>
                <td><span className={styles.kn}>{r.merk}</span> <span className={styles.modelAccent}>{r.model}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.klant || '—'}</td>
                <td>{r.type ? <span className={`${styles.badge} ${TYPE_CSS[r.type]}`}>{TYPE_LABEL[r.type]}</span> : '—'}</td>
                <td><PlatenBadge platen={r.platen} /></td>
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <Cb aan={!!r.binnen} onClick={() => onToggle(r.id, 'binnen')} />
                </td>
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <Cb aan={!!r.aflevercontrole} onClick={() => onToggle(r.id, 'aflevercontrole')} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{datumFmt(r.afleverdatum) !== '—' ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{datumFmt(r.afleverdatum)}</span> : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.wie_levert_af || '—'}</td>

                {/* Status */}
                <td onClick={(e) => e.stopPropagation()}>
                  <div className={styles.statusRij}>
                    {r.type === 'import' && (
                      <div className={styles.statusItem}>
                        <div className={`${styles.dot} ${importDot}`} title={r.bin_ontvangen ? 'BIN ontvangen — kenteken bekend' : 'Import nog niet afgerond'} />
                        <span className={styles.statusLabel}>Import</span>
                      </div>
                    )}
                    <div className={styles.statusItem}>
                      <div className={`${styles.dot} ${rijklaarDot}`} title={r.klaar ? 'Rijklaar' : (r.binnen && r.proefrit) ? 'Binnen + proef OK' : 'Niet rijklaar'} />
                      <span className={styles.statusLabel}>Rijklaar</span>
                    </div>
                  </div>
                </td>

                {/* Acties */}
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.afleverKnop}
                    onClick={() => onAfleveren(r)}
                  >
                    ✅ Afleveren
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Aflevering plannen popup ──────────────────────────────────
function AfleveringPopup({ auto, isBewerken, onOpslaan, onSluiten }: {
  auto: AfterSalesAuto;
  isBewerken: boolean;
  onOpslaan: (updates: Partial<AfterSalesAuto>, stuurMail: boolean) => void;
  onSluiten: () => void;
}) {
  const [datum, setDatum] = useState(auto.afleverdatum ?? vandaagStr());
  const [tijdstip, setTijdstip] = useState(auto.tijdstip_levering ?? '');
  const [factuur, setFactuur] = useState(auto.factuur ?? false);
  const [poetsen, setPoetsen] = useState(auto.poetsen ?? false);
  const [hubspot, setHubspot] = useState(auto.hubspot ?? false);
  const [bijzonderheden, setBijzonderheden] = useState(auto.taken_notitie ?? '');

  function handleOpslaan(stuurMail: boolean) {
    if (stuurMail) mailAflevering(auto, datum, tijdstip, factuur, poetsen, hubspot, bijzonderheden);
    onOpslaan({ afleverdatum: datum, tijdstip_levering: tijdstip, factuur, poetsen, hubspot, taken_notitie: bijzonderheden }, stuurMail);
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal} style={{ maxWidth: 500 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>Aflevering plannen</div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>
        <div className={styles.modalBody} style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className={`${styles.fg} ${styles.vol}`} style={{ marginBottom: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Plan de aflevering. Er gaat een mail naar Roger en Lorenzo met de uit te voeren taken.
            </p>
          </div>

          <div className={styles.fg}>
            <label>Afleverdatum</label>
            <input className="fi" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className={styles.fg}>
            <label>Tijdstip</label>
            <input className="fi" type="time" value={tijdstip} onChange={(e) => setTijdstip(e.target.value)} />
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Taken voor Roger / Lorenzo</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {[
                { aan: factuur, set: setFactuur, l: '📋 Factuur maken' },
                { aan: poetsen, set: setPoetsen, l: '🧹 Poetsen' },
                { aan: hubspot, set: setHubspot, l: '🟠 In HubSpot zetten' },
              ].map(({ aan, set, l }) => (
                <div key={l} className={styles.cbRij} style={{ cursor: 'pointer', width: 'fit-content' }} onClick={() => set(!aan)}>
                  <div className={`${styles.cb} ${aan ? styles.on : ''}`}>
                    {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span style={{ fontSize: 13 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Bijzonderheden / Opmerkingen</label>
            <textarea className="fi" rows={3} placeholder="Eventuele bijzonderheden..." value={bijzonderheden} onChange={(e) => setBijzonderheden(e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          {isBewerken && (
            <button className="btn" onClick={() => handleOpslaan(false)}>Opslaan</button>
          )}
          <button className="btn btn-a" onClick={() => handleOpslaan(true)}>
            📅 Plan aflevering &amp; Mail sturen
          </button>
        </div>
      </div>
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

// ── Platen badge ──────────────────────────────────────────────
function PlatenBadge({ platen }: { platen?: string }) {
  if (!platen) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const p = platen.toLowerCase();
  if (p.includes('g+w') || p.includes('geel') && p.includes('wit')) {
    return <span className={styles.platenGW}>G+W</span>;
  }
  if (p.includes('geel')) return <span className={styles.platenGeel}>GEEL</span>;
  return <span style={{ fontSize: 12, color: 'var(--muted)' }}>{platen}</span>;
}

// ── APK chip ──────────────────────────────────────────────────
function ApkChip({ apk, onClick }: { apk?: string; onClick: (e: React.MouseEvent) => void }) {
  const kleur = apkKleur(apk);
  const klsMap = { groen: styles.apkGroen, oranje: styles.apkOranje, rood: styles.apkRood, '': styles.apkRdw };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {apk ? (
        <span className={`${styles.apkChip} ${klsMap[kleur]}`}>{datumFmt(apk)}</span>
      ) : null}
      <button className={styles.rdwKnop} onClick={onClick} title="Ophalen uit RDW">• RDW</button>
    </div>
  );
}

// ── Tab: Rijklaar maken ───────────────────────────────────────
function TabRijklaar({ autos, zoek, onEdit, onUpdate }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onUpdate: (rec: AfterSalesAuto) => Promise<void>;
}) {
  const [accPopupId, setAccPopupId] = useState<string | null>(null);
  const [nieuweAcc, setNieuweAcc] = useState('');
  const [rdwLaden, setRdwLaden] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const rijen = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Geen auto's</div>;

  function toggleBool(r: AfterSalesAuto, veld: keyof AfterSalesAuto) {
    const nieuweWaarde = !r[veld];
    const extra: Partial<AfterSalesAuto> = {};
    if (veld === 'binnen') extra.binnen_op = nieuweWaarde ? vandaagStr() : undefined;
    if (veld === 'proefrit') extra.proefrit_op = nieuweWaarde ? vandaagStr() : undefined;
    onUpdate({ ...r, [veld]: nieuweWaarde, ...extra });
  }

  function toggleWie(r: AfterSalesAuto) {
    onUpdate({ ...r, wie_rijklaar_klaar: !r.wie_rijklaar_klaar });
  }

  async function haalRdwOp(r: AfterSalesAuto, e: React.MouseEvent) {
    e.stopPropagation();
    setRdwLaden(r.id);
    const result = await rdwOphalen(r.kenteken);
    await onUpdate({ ...r, ...result });
    setRdwLaden(null);
  }

  function toggleAcc(r: AfterSalesAuto, item: string) {
    const items = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const klaar = (r.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const isKlaar = klaar.includes(item);
    const nieuweKlaar = isKlaar ? klaar.filter((k) => k !== item) : [...klaar, item];
    onUpdate({ ...r, accessoires_klaar: nieuweKlaar.join(',') });
  }

  function verwijderAcc(r: AfterSalesAuto, item: string) {
    const items = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean).filter((i) => i !== item);
    const klaar = (r.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean).filter((i) => i !== item);
    onUpdate({ ...r, accessoires: items.join(','), accessoires_klaar: klaar.join(',') });
  }

  function voegAccToe(r: AfterSalesAuto) {
    if (!nieuweAcc.trim()) return;
    const items = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.includes(nieuweAcc.trim())) items.push(nieuweAcc.trim());
    onUpdate({ ...r, accessoires: items.join(',') });
    setNieuweAcc('');
  }

  return (
    <div className={styles.tabelWrapper} onClick={() => setAccPopupId(null)}>
      <table className={styles.tabel} style={{ minWidth: 1100 }}>
        <thead><tr>
          <th>Kenteken</th>
          <th>Merk / Model</th>
          <th>Klant</th>
          <th>Type</th>
          <th>Wie</th>
          <th className={styles.chk}>Binn.</th>
          <th className={styles.chk}>Proef</th>
          <th>Platen</th>
          <th>APK</th>
          <th>Terugroep</th>
          <th>Acc. + Mwrk</th>
          <th className={styles.chk}>Aflctr.</th>
          <th className={styles.chk}>Klaar</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const accItems = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean);
            const accKlaar = (r.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean);
            const accPopupOpen = accPopupId === r.id;
            const kleurTr = r.klaar ? styles.dotGroen : undefined;
            const terugroepOpen = r.terugroep && r.terugroep !== 'geen';

            return (
              <tr key={r.id} onClick={() => onEdit(r)}>
                {/* Kenteken */}
                <td><KentekenPlaat kenteken={r.kenteken} /></td>

                {/* Merk / Model */}
                <td>
                  <span className={styles.kn}>{r.merk}</span>{' '}
                  <span className={styles.modelAccent}>{r.model}</span>
                </td>

                {/* Klant */}
                <td style={{ whiteSpace: 'nowrap' }}>{r.klant || '—'}</td>

                {/* Type */}
                <td>
                  {r.type
                    ? <span className={`${styles.badge} ${TYPE_CSS[r.type]}`}>{TYPE_LABEL[r.type]}</span>
                    : '—'}
                </td>

                {/* Wie */}
                <td onClick={(e) => e.stopPropagation()}>
                  {r.wie_rijklaar ? (
                    <button
                      className={`${styles.wieChip} ${r.wie_rijklaar_klaar ? styles.wieKlaar : ''}`}
                      onClick={() => toggleWie(r)}
                      title="Klik om te bevestigen"
                    >
                      {r.wie_rijklaar_klaar && '✓ '}{r.wie_rijklaar}
                    </button>
                  ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                </td>

                {/* Binnen */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div
                      className={`${styles.cb} ${r.binnen ? styles.onAccent : ''}`}
                      onClick={() => toggleBool(r, 'binnen')}
                    >
                      {r.binnen && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    {r.binnen_op && <span className={styles.datumtje}>{datumFmt(r.binnen_op)}</span>}
                  </div>
                </td>

                {/* Proef */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div
                      className={`${styles.cb} ${r.proefrit ? styles.onAccent : ''}`}
                      onClick={() => toggleBool(r, 'proefrit')}
                    >
                      {r.proefrit && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    {r.proefrit_op && <span className={styles.datumtje}>{datumFmt(r.proefrit_op)}</span>}
                  </div>
                </td>

                {/* Platen */}
                <td><PlatenBadge platen={r.platen} /></td>

                {/* APK */}
                <td onClick={(e) => e.stopPropagation()}>
                  <ApkChip
                    apk={r.apk}
                    onClick={(e) => haalRdwOp(r, e)}
                  />
                  {rdwLaden === r.id && <span style={{ fontSize: 10, color: 'var(--muted)' }}>laden...</span>}
                </td>

                {/* Terugroep */}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div className={`${styles.dot} ${!r.terugroep ? styles.dotOranje : terugroepOpen ? styles.dotRood : styles.dotGroen}`} />
                    <span style={{ fontSize: 11, color: terugroepOpen ? 'var(--red)' : 'var(--muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {terugroepOpen ? r.terugroep : (r.terugroep === 'geen' ? 'geen' : 'RDW')}
                    </span>
                  </div>
                </td>

                {/* Acc + Mwrk */}
                <td style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 100 }}>
                    {accItems.map((item) => (
                      <span
                        key={item}
                        className={`${styles.accChip} ${accKlaar.includes(item) ? styles.accKlaar : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleAcc(r, item); }}
                        title={accKlaar.includes(item) ? 'Klik om af te vinken' : 'Klik om klaar te markeren'}
                      >
                        {accKlaar.includes(item) && '✓ '}{item}
                      </span>
                    ))}
                    {accItems.length < 5 && (
                      <button
                        className={styles.accPlusKnop}
                        onClick={(e) => { e.stopPropagation(); setAccPopupId(accPopupOpen ? null : r.id); setNieuweAcc(''); }}
                        title="Accessoires beheren"
                      >+</button>
                    )}
                    {accItems.length >= 5 && (
                      <button
                        className={styles.accPlusKnop}
                        onClick={(e) => { e.stopPropagation(); setAccPopupId(accPopupOpen ? null : r.id); setNieuweAcc(''); }}
                      >+{accItems.length - 4}</button>
                    )}

                    {/* Popup */}
                    {accPopupOpen && (
                      <div ref={popupRef} className={styles.accPopup} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.accPopupTitel}>🔧 Accessoires</div>
                        <div className={styles.accLijst}>
                          {accItems.map((item) => (
                            <div key={item} className={styles.accRij}>
                              <div
                                className={`${styles.cb} ${accKlaar.includes(item) ? styles.on : ''}`}
                                style={{ flexShrink: 0 }}
                                onClick={() => toggleAcc(r, item)}
                              >
                                {accKlaar.includes(item) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span className={`${styles.accNaam} ${accKlaar.includes(item) ? styles.accKlaarNaam : ''}`}>{item}</span>
                              <button className={styles.accVerwijder} onClick={() => verwijderAcc(r, item)}>×</button>
                            </div>
                          ))}
                        </div>
                        <div className={styles.accInput}>
                          <input
                            className="fi"
                            placeholder="bijv. Trekhaak, Belettering, Matten..."
                            value={nieuweAcc}
                            onChange={(e) => setNieuweAcc(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && voegAccToe(r)}
                            style={{ flex: 1, fontSize: 12 }}
                          />
                          <button className="btn btn-a" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }} onClick={() => voegAccToe(r)}>+ Toevoegen</button>
                        </div>
                        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={() => setAccPopupId(null)}>Klaar</button>
                      </div>
                    )}
                  </div>
                </td>

                {/* Aflevercontrole */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <Cb aan={!!r.aflevercontrole} onClick={() => onUpdate({ ...r, aflevercontrole: !r.aflevercontrole })} />
                </td>

                {/* Klaar */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <Cb aan={!!r.klaar} onClick={() => onUpdate({ ...r, klaar: !r.klaar })} />
                </td>
              </tr>
            );
          })}
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

function TabGepland({ autos, zoek, onToggle, onBewerken, onAfgeleverd }: {
  autos: AfterSalesAuto[]; zoek: string;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
  onBewerken: (r: AfterSalesAuto) => void;
  onAfgeleverd: (r: AfterSalesAuto) => void;
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
          <th>Notitie</th><th>Acties</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id}>
              <td><KentekenPlaat kenteken={r.kenteken} /></td>
              <td><span className={styles.kn}>{r.merk}</span> <span className={styles.modelAccent}>{r.model}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.klant || '—'}</td>
              <td>{r.type ? <span className={`${styles.badge} ${TYPE_CSS[r.type]}`}>{TYPE_LABEL[r.type]}</span> : '—'}</td>
              <td style={{ fontWeight: 600, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                {datumFmt(r.afleverdatum)}{r.tijdstip_levering ? ` ${r.tijdstip_levering}` : ''}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.wie_levert_af || '—'}</td>
              {AFLEVERING_CHECKS.map((s) => (
                <td key={s.veld} className={styles.chk}>
                  <Cb aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} />
                </td>
              ))}
              <td style={{ maxWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: r.taken_notitie ? 6 : 0 }}>{r.taken_notitie || ''}</div>
                <button className={styles.bewerkLink} onClick={() => onBewerken(r)}>✏ Bewerken</button>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className={styles.afleverKnop} onClick={() => onAfgeleverd(r)}>✅ Afgeleverd</button>
              </td>
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
  const [afleverAuto, setAfleverAuto] = useState<{ auto: AfterSalesAuto; bewerken: boolean } | null>(null);

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

  async function handleAfleveringOpslaan(updates: Partial<AfterSalesAuto>) {
    if (!afleverAuto) return;
    await updateAuto({ ...afleverAuto.auto, ...updates });
    setAfleverAuto(null);
    setTab('gepland');
  }

  async function handleAfgeleverd(r: AfterSalesAuto) {
    const naam = [r.merk, r.model, r.klant ? `(${r.klant})` : ''].filter(Boolean).join(' ');
    if (!confirm(`Weet je zeker dat je ${naam} wilt archiveren als afgeleverd?`)) return;
    await updateAuto({ ...r, gearchiveerd: true, afgeleverd_op: vandaagStr(), wie_heeft_afgeleverd: r.wie_levert_af ?? '' });
    schietConfetti();
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
          {tab === 'lopend'    && <TabLopend    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} onAfleveren={(r) => setAfleverAuto({ auto: r, bewerken: false })} />}
          {tab === 'import'   && <TabImport    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} />}
          {tab === 'rijklaar' && <TabRijklaar  autos={autos} zoek={zoek} onEdit={openEdit} onUpdate={updateAuto} />}
          {tab === 'gepland'  && <TabGepland   autos={autos} zoek={zoek} onToggle={toggleAuto} onBewerken={(r) => setAfleverAuto({ auto: r, bewerken: true })} onAfgeleverd={handleAfgeleverd} />}
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

      {/* Aflevering plannen popup */}
      {afleverAuto && (
        <AfleveringPopup
          auto={afleverAuto.auto}
          isBewerken={afleverAuto.bewerken}
          onOpslaan={(updates) => handleAfleveringOpslaan(updates)}
          onSluiten={() => setAfleverAuto(null)}
        />
      )}
    </div>
  );
}
