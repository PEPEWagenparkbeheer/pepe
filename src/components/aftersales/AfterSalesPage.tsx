'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAfterSales } from '@/hooks/useAfterSales';
import { useAuth } from '@/hooks/useAuth';
import { schietConfetti } from '@/lib/confetti';
import type { AfterSalesAuto, ASAutoType, ASKlacht, BtwAutoType, KlachtUpdate } from '@/types';
import { usePartnerLijst } from '@/hooks/usePartnerLijst';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import KentekenPlaat from './KentekenPlaat';
import AfterSalesModal from './AfterSalesModal';
import styles from './AfterSalesPage.module.css';


type HoofdTab = 'lopend' | 'import' | 'rijklaar' | 'gepland' | 'nalevering' | 'archief';
type NalTab = 'open' | 'opgelost';

const AS_MEDEWERKERS = ['Roger', 'Lorenzo', 'Joep', 'Diego', 'Jasper'];
const KLACHT_STATUSSEN = [
  { k: 'open',           l: 'Open' },
  { k: 'in_behandeling', l: 'In behandeling' },
  { k: 'opgelost',       l: 'Opgelost' },
] as const;

// ── Helpers ───────────────────────────────────────────────────
function Cb({ aan, onClick }: { aan: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className={`${styles.cb} ${aan ? styles.on : ''}`} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
      {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

// ── Portal tooltip (ontsnapt aan table overflow-x) ───────────
function PortalTip({ children, tip }: { children: React.ReactNode; tip: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      style={{ display: 'inline-block', cursor: 'default' }}
      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom + 8 }); }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: pos.y, left: pos.x, width: 290,
          background: '#16181f', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 10, padding: '10px 14px', fontSize: 12,
          zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.7)',
          display: 'flex', flexDirection: 'column', gap: 5,
          pointerEvents: 'none',
        }}>
          {tip}
        </div>,
        document.body
      )}
    </div>
  );
}

function metaTijd(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function CbMeta({ aan, onClick, meta, accentKleur }: {
  aan: boolean;
  onClick: (e: React.MouseEvent) => void;
  meta?: { op: string; door: string };
  accentKleur?: boolean;
}) {
  const cls = `${styles.cb} ${aan ? (accentKleur ? styles.onAccent : styles.on) : ''}`;
  const checkKleur = accentKleur ? '#fff' : '#000';
  return (
    <div className={styles.cbWrap}>
      <div className={cls} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
        {aan && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke={checkKleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      {aan && meta && (
        <div className={styles.cbTip}>
          <span className={styles.cbTipDoor}>{meta.door}</span>
          <span className={styles.cbTipTijd}>{metaTijd(meta.op)}</span>
        </div>
      )}
    </div>
  );
}

function importVoortgang(r: AfterSalesAuto): number {
  const stappen = ['aangevraagd','betaald','binnen','rdw_ingeschreven','bpm_ingediend','bpm_goedgekeurd','bin_ontvangen','kentekenbewijzen','gelangenbest'] as const;
  const aan = stappen.filter((k) => r[k]).length;
  return Math.round((aan / stappen.length) * 100);
}

function datumFmt(d?: string, metJaar = false) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', ...(metJaar ? { year: '2-digit' } : {}) }); } catch { return d; }
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
function KpiStrip({ autos, klachten, onKpiKlik }: { autos: AfterSalesAuto[]; klachten: ASKlacht[]; onKpiKlik: (tab: HoofdTab, filter?: string) => void }) {
  const nu = new Date();
  const actief = autos.filter((r) => !r.gearchiveerd);

  const binnen = actief.filter((r) => r.binnen).length;
  const rijklaar = actief.filter((r) => r.binnen && !r.klaar).length;

  const apkWaarsch = actief.filter((r) => {
    if (!r.apk) return false;
    const maanden = (new Date(r.apk).getTime() - nu.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
    return maanden < 6;
  }).length;

  const recalls = actief.filter((r) => r.terugroep && r.terugroep !== 'geen').length;
  const openKlachten = klachten.filter((k) => k.status !== 'opgelost').length;

  const klaarZonderDatum = actief.filter((r) => {
    if (r.afleverdatum) return false;
    return r.type === 'import'
      ? (r.binnen && r.aflevercontrole && r.klaar)
      : !!r.klaar;
  }).length;

  const geplandAfl = actief.filter((r) => !!r.afleverdatum).length;

  const binnenLang = actief.filter((r) => {
    const staDag = r.binnen_op ?? r.veld_meta?.['binnen']?.op ?? null;
    return staDag && !r.afleverdatum &&
      Math.floor((Date.now() - new Date(staDag).getTime()) / 86_400_000) > 14;
  }).length;

  const kaarten: { icoon: string; getal: number; label: string; kleur: string; tab: HoofdTab; filter?: string }[] = [
    { icoon: '📦', getal: binnen, label: "Auto's binnen", kleur: binnen > 0 ? 'ok' : '', tab: 'lopend' },
    { icoon: '🚗', getal: rijklaar, label: 'Rijklaar te maken', kleur: '', tab: 'rijklaar' },
    { icoon: '📅', getal: apkWaarsch, label: 'APK < 6 mnd', kleur: apkWaarsch > 0 ? 'warn' : '', tab: 'rijklaar', filter: 'apk' },
    { icoon: '🔔', getal: recalls, label: 'Terugroepacties', kleur: recalls > 0 ? 'hot' : '', tab: 'rijklaar', filter: 'terugroep' },
    { icoon: '⚠️', getal: openKlachten, label: 'Open klachten', kleur: openKlachten > 0 ? 'warn' : '', tab: 'nalevering' },
    { icoon: '🚗', getal: klaarZonderDatum, label: 'Klaar — datum plan', kleur: klaarZonderDatum > 0 ? 'ok' : '', tab: 'gepland' },
    { icoon: '📅', getal: geplandAfl, label: 'Geplande afleveringen', kleur: geplandAfl > 0 ? 'warn' : '', tab: 'gepland' },
    { icoon: '⏳', getal: binnenLang, label: 'Binnen > 14 dagen', kleur: binnenLang > 0 ? 'hot' : '', tab: 'lopend' },
  ];

  return (
    <div className={`${styles.kpiStrip} ${styles.col7}`} style={{ gridTemplateColumns: `repeat(${kaarten.length}, 1fr)` }}>
      {kaarten.map(({ icoon, getal, label, kleur, tab, filter }) => (
        <div key={label} className={styles.kpiCard} onClick={() => onKpiKlik(tab, filter)}>
          <div className={styles.kpiIcoon}>{icoon}</div>
          <div className={`${styles.kpiGetal} ${kleur ? styles[kleur as 'warn' | 'ok' | 'hot'] : ''}`}>{getal}</div>
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

// ── Stadagen badge ────────────────────────────────────────────
function StaDagen({ datum, tot }: { datum?: string; tot?: string }) {
  if (!datum) return null;
  const eind = tot ? new Date(tot).getTime() : Date.now();
  const dagen = Math.floor((eind - new Date(datum).getTime()) / 86_400_000);
  const kleur = tot ? 'var(--muted)' : dagen > 21 ? 'var(--red)' : dagen > 14 ? '#f97316' : 'var(--muted)';
  return (
    <div style={{ fontSize: 11, color: kleur, marginTop: 4, fontWeight: 600 }}>
      {dagen}dgn{tot ? ' ✓' : ''}
    </div>
  );
}

// ── Tab: In behandeling ───────────────────────────────────────
function TabLopend({ autos, zoek, onEdit, onToggle, onAfleveren }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
  onAfleveren: (r: AfterSalesAuto) => void;
}) {
  const rijen = useMemo(() => {
    const gefilterd = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
    return [...gefilterd].sort((a, b) => {
      // Binnen=true bovenaan
      if (!!a.binnen !== !!b.binnen) return a.binnen ? -1 : 1;
      // Daarna oudste binnen_op eerst
      const dA = a.binnen_op ?? '';
      const dB = b.binnen_op ?? '';
      return dA < dB ? -1 : dA > dB ? 1 : 0;
    });
  }, [autos, zoek]);
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
                <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.klant || '—'}</td>
                <td>{r.type ? <span className={`${styles.badge} ${TYPE_CSS[r.type]}`}>{TYPE_LABEL[r.type]}</span> : '—'}</td>
                <td><PlatenBadge platen={r.platen} /></td>
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <CbMeta aan={!!r.binnen} onClick={() => onToggle(r.id, 'binnen')} meta={r.veld_meta?.['binnen']} />
                </td>
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <CbMeta aan={!!r.aflevercontrole} onClick={() => onToggle(r.id, 'aflevercontrole')} meta={r.veld_meta?.['aflevercontrole']} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {datumFmt(r.afleverdatum) !== '—' ? (
                    r.tijdstip_levering ? (
                      <PortalTip tip={
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f0eef8' }}>🕐 {r.tijdstip_levering}</span>
                      }>
                        <span style={{ color: 'var(--green)', fontWeight: 600, cursor: 'default', borderBottom: '1px dashed var(--green)', paddingBottom: 1 }}>
                          {datumFmt(r.afleverdatum)}
                        </span>
                      </PortalTip>
                    ) : (
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>{datumFmt(r.afleverdatum)}</span>
                    )
                  ) : '—'}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.wie_levert_af || '—'}</td>

                {/* Status */}
                <td onClick={(e) => e.stopPropagation()}>
                  <div className={styles.statusRij}>
                    {r.type === 'import' && (
                      <PortalTip tip={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontWeight: 700, color: '#f0eef8', marginBottom: 2 }}>Import status</div>
                          {[
                            { lbl: 'RDW inschr.',     aan: !!r.rdw_ingeschreven, meta: r.veld_meta?.['rdw_ingeschreven'] },
                            { lbl: 'BPM inged.',      aan: !!r.bpm_ingediend,    meta: r.veld_meta?.['bpm_ingediend'] },
                            { lbl: 'BPM goedgek.',    aan: !!r.bpm_goedgekeurd,  meta: r.veld_meta?.['bpm_goedgekeurd'] },
                            { lbl: 'BIN ontv.',       aan: !!r.bin_ontvangen,    meta: r.veld_meta?.['bin_ontvangen'] },
                          ].map(({ lbl, aan, meta, extra }: { lbl: string; aan: boolean; meta?: { op: string; door: string }; extra?: string }) => (
                            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <span style={{ color: aan ? '#4ade80' : '#f87171', fontWeight: 700, minWidth: 14 }}>{aan ? '✓' : '✗'}</span>
                              <span style={{ color: aan ? '#c8f7c5' : 'rgba(255,255,255,.55)' }}>{lbl}</span>
                              {extra && <span style={{ color: 'var(--muted)', fontSize: 11 }}>— {extra}</span>}
                              {meta && <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 'auto' }}>{meta.door} {metaTijd(meta.op)}</span>}
                            </div>
                          ))}
                        </div>
                      }>
                        <div className={styles.statusItem}>
                          <div className={`${styles.dot} ${importDot}`} />
                          <span className={styles.statusLabel}>Import</span>
                        </div>
                      </PortalTip>
                    )}
                    <PortalTip tip={
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 700, color: '#f0eef8', marginBottom: 2 }}>Rijklaar status</div>
                        {[
                          { lbl: 'Proefrit',      aan: !!r.proefrit,           meta: r.veld_meta?.['proefrit'] },
                          { lbl: 'APK',           aan: !!r.apk,                extra: r.apk && r.apk !== 'geen' ? r.apk : undefined },
                          { lbl: 'Terugroep',     aan: r.terugroep === 'geen', extra: r.terugroep && r.terugroep !== 'geen' ? r.terugroep : undefined },
                          { lbl: 'Accessoires',   aan: !r.accessoires || r.accessoires.split(',').every(a => (r.accessoires_klaar ?? '').split(',').includes(a.trim())) },
                          { lbl: 'Klaar',         aan: !!r.klaar,              meta: r.veld_meta?.['klaar'] },
                        ].map(({ lbl, aan, meta, extra }) => (
                          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <span style={{ color: aan ? '#4ade80' : '#f87171', fontWeight: 700, minWidth: 14 }}>{aan ? '✓' : '✗'}</span>
                            <span style={{ color: aan ? '#c8f7c5' : 'rgba(255,255,255,.55)' }}>{lbl}</span>
                            {extra && <span style={{ color: 'var(--muted)', fontSize: 11 }}>— {extra}</span>}
                            {meta && <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 'auto' }}>{meta.door} {metaTijd(meta.op)}</span>}
                          </div>
                        ))}
                      </div>
                    }>
                      <div className={styles.statusItem}>
                        <div className={`${styles.dot} ${rijklaarDot}`} />
                        <span className={styles.statusLabel}>Rijklaar</span>
                      </div>
                    </PortalTip>
                  </div>
                  <StaDagen datum={r.binnen_op ?? r.veld_meta?.['binnen']?.op ?? (r.binnen ? vandaagStr() : undefined)} tot={r.afgeleverd_op} />
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
// Stappen voor BIN: alles vóór bin_ontvangen, dan bin (popup), dan erna
const IMPORT_VOOR_BIN: { veld: keyof AfterSalesAuto; label: string }[] = [
  { veld: 'aangevraagd',      label: 'Aangevr.' },
  { veld: 'betaald',          label: 'Betaald' },
  { veld: 'rdw_ingeschreven', label: 'RDW Inschr.' },
  { veld: 'bpm_ingediend',    label: 'BPM ingd.' },
  { veld: 'bpm_goedgekeurd',  label: 'BPM goedg.' },
];
const IMPORT_NA_BIN: { veld: keyof AfterSalesAuto; label: string }[] = [
  { veld: 'kentekenbewijzen', label: 'Kentekenbew.' },
  { veld: 'gelangenbest',     label: 'Gelangenbest.' },
];

function TabImport({ autos, zoek, onEdit, onToggle, onUpdate }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onToggle: (id: string, veld: keyof AfterSalesAuto) => void;
  onUpdate: (r: AfterSalesAuto) => Promise<void>;
}) {
  const [binPopup, setBinPopup] = useState<AfterSalesAuto | null>(null);
  const [kentekentje, setKentekentje] = useState('');

  const rijen = useMemo(() => {
    const gefilterd = autos.filter((r) => r.type === 'import' && !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
    return [...gefilterd].sort((a, b) => {
      // BIN ontvangen → onderaan
      if (!!a.bin_ontvangen !== !!b.bin_ontvangen) return a.bin_ontvangen ? 1 : -1;
      // Daarna oudste binnen_op bovenaan
      const dA = a.binnen_op ?? '';
      const dB = b.binnen_op ?? '';
      return dA < dB ? -1 : dA > dB ? 1 : 0;
    });
  }, [autos, zoek]);

  async function handleBinBevestig() {
    if (!binPopup) return;
    await onUpdate({ ...binPopup, bin_ontvangen: true, kenteken: kentekentje.trim() || binPopup.kenteken || '' });
    setBinPopup(null);
    setKentekentje('');
  }

  if (!rijen.length) return <div className={styles.leeg}>Geen importauto's</div>;
  return (
    <>
      {binPopup && (
        <div className={styles.overlay} onClick={() => setBinPopup(null)}>
          <div className={styles.modal} style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitel}>📦 BIN ontvangen</span>
              <button className={styles.sluitKnop} onClick={() => setBinPopup(null)}>×</button>
            </div>
            <div className={styles.modalBody} style={{ display: 'block', padding: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                {binPopup.merk} {binPopup.model} — {binPopup.klant}
              </p>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Kenteken</label>
              <input
                className="fi"
                placeholder="bv. KGT-37-Z"
                value={kentekentje}
                onChange={(e) => setKentekentje(e.target.value.toUpperCase())}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleBinBevestig()}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className="btn" onClick={() => setBinPopup(null)}>Annuleer</button>
              <button className="btn btn-a" onClick={handleBinBevestig}>✅ Bevestig BIN</button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.tabelWrapper}>
        <table className={styles.tabel}>
          <thead><tr>
            <th>Kenteken</th>
            <th>Merk / Model</th>
            <th>Klant</th>
            <th>Aangevr.</th>
            <th>Transportdatum</th>
            <th>TC Status</th>
            <th className={styles.chk}>Betaald</th>
            <th className={styles.chk}>Binnen</th>
            {IMPORT_VOOR_BIN.slice(2).map((s) => <th key={s.veld} className={styles.chk}>{s.label}</th>)}
            <th className={styles.chk}>BIN ontv.</th>
            {IMPORT_NA_BIN.map((s) => <th key={s.veld} className={styles.chk}>{s.label}</th>)}
            <th>Voortgang</th>
          </tr></thead>
          <tbody>
            {rijen.map((r) => {
              const pct = importVoortgang(r);
              return (
                <tr key={r.id} onClick={() => onEdit(r)} style={{ opacity: r.bin_ontvangen ? 0.65 : 1 }}>
                  <td><KentekenPlaat kenteken={r.kenteken ?? ''} /></td>
                  <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
                  <td>{r.klant}</td>
                  <td className={styles.chk}><CbMeta aan={!!r.aangevraagd} onClick={() => onToggle(r.id, 'aangevraagd')} meta={r.veld_meta?.['aangevraagd']} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      className={styles.datumInput}
                      value={r.transportdatum ?? ''}
                      onChange={(e) => onUpdate({ ...r, transportdatum: e.target.value })}
                    />
                  </td>
                  <td><TransportStatusChip auto={r} /></td>
                  <td className={styles.chk}><CbMeta aan={!!r.betaald} onClick={() => onToggle(r.id, 'betaald')} meta={r.veld_meta?.['betaald']} /></td>
                  <td className={styles.chk}><CbMeta aan={!!r.binnen} onClick={() => onToggle(r.id, 'binnen')} meta={r.veld_meta?.['binnen']} /></td>
                  {IMPORT_VOOR_BIN.slice(2).map((s) => (
                    <td key={s.veld} className={styles.chk}>
                      <CbMeta aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} meta={r.veld_meta?.[String(s.veld)]} />
                    </td>
                  ))}
                  <td className={styles.chk}>
                    {r.bin_ontvangen ? (
                      <CbMeta aan={true} onClick={() => onToggle(r.id, 'bin_ontvangen')} meta={r.veld_meta?.['bin_ontvangen']} />
                    ) : (
                      <Cb aan={false} onClick={(e) => { e.stopPropagation(); setBinPopup(r); setKentekentje(r.kenteken ?? ''); }} />
                    )}
                  </td>
                  {IMPORT_NA_BIN.map((s) => (
                    <td key={s.veld} className={styles.chk}>
                      <CbMeta aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} meta={r.veld_meta?.[String(s.veld)]} />
                    </td>
                  ))}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className={styles.voortgang} style={{ flex: 1 }}>
                        <div className={styles.voortgangBalk} style={{ width: pct + '%' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{Math.round(pct)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── TransConnect status chip ──────────────────────────────────
function TransportStatusChip({ auto }: { auto: AfterSalesAuto }) {
  if (auto.binnen || auto.bin_ontvangen) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap' }}>🟢 Aangekomen</span>;
  }
  if (auto.transport_status) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', whiteSpace: 'nowrap' }}>🔵 {auto.transport_status}</span>;
  }
  if (auto.aangevraagd) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: '#ca8a04', whiteSpace: 'nowrap' }}>🟡 Aangevraagd</span>;
  }
  return <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>;
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
        <span className={`${styles.apkChip} ${klsMap[kleur]}`}>{datumFmt(apk, true)}</span>
      ) : null}
      <button className={styles.rdwKnop} onClick={onClick} title="Ophalen uit RDW">• RDW</button>
    </div>
  );
}

// ── Tab: Rijklaar maken ───────────────────────────────────────
function TabRijklaar({ autos, zoek, kpiFilter, onEdit, onUpdate, onToggleMeta }: {
  autos: AfterSalesAuto[]; zoek: string; kpiFilter?: string | null;
  onEdit: (r: AfterSalesAuto) => void;
  onUpdate: (rec: AfterSalesAuto) => Promise<void>;
  onToggleMeta: (rec: AfterSalesAuto, veld: keyof AfterSalesAuto, nieuweWaarde: boolean, extra?: Partial<AfterSalesAuto>) => Promise<void>;
}) {
  const [accPopupId, setAccPopupId] = useState<string | null>(null);
  const [partnerPopupId, setPartnerPopupId] = useState<string | null>(null);
  const [partnerFilter, setPartnerFilter] = useState<string | null>(null);
  const [nieuwBericht, setNieuwBericht] = useState('');
  const [nieuweAcc, setNieuweAcc] = useState('');
  const [rdwLaden, setRdwLaden] = useState<string | null>(null);
  const { namen: partnerLijst } = usePartnerLijst();
  const { records: wdRecords } = useWerkDerden();
  const { user } = useAuth();
  const mijnNaam = (user?.user_metadata?.naam as string) ?? user?.email ?? 'PEPE';

  function heeftNieuweUpdate(r: AfterSalesAuto): boolean {
    const updates = r.partner_updates ?? [];
    if (updates.length === 0) return false;
    const laatste = updates[0].op;
    const gezien = r.partner_updates_gezien_op;
    if (!gezien) return true;
    return new Date(laatste).getTime() > new Date(gezien).getTime();
  }

  const rijen = useMemo(() => {
    const gefilterd = autos.filter((r) => {
      if (r.gearchiveerd) return false;
      if (zoek && !zoekMatch(r, zoek)) return false;
      if (kpiFilter === 'terugroep' && !(r.terugroep && r.terugroep !== 'geen')) return false;
      if (kpiFilter === 'apk') { if (!r.apk) return false; const mnd = (new Date(r.apk).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.5); if (!(mnd < 6)) return false; }
      if (partnerFilter) {
        const partners = r.partners_toegewezen ?? (r.wie_rijklaar ? [r.wie_rijklaar] : []);
        if (!partners.some((p) => p.toUpperCase() === partnerFilter.toUpperCase())) return false;
      }
      return true;
    });
    return [...gefilterd].sort((a, b) => {
      // Klaar onderaan
      if (!!a.klaar !== !!b.klaar) return a.klaar ? 1 : -1;
      // Niet binnen onderaan (boven klaar)
      if (!!a.binnen !== !!b.binnen) return a.binnen ? -1 : 1;
      // Oudste binnen_op bovenaan
      const dA = a.binnen_op ?? '';
      const dB = b.binnen_op ?? '';
      return dA < dB ? -1 : dA > dB ? 1 : 0;
    });
  }, [autos, zoek, kpiFilter, partnerFilter]);

  const partnerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    autos.forEach((r) => {
      if (r.gearchiveerd) return;
      const partners = r.partners_toegewezen ?? (r.wie_rijklaar ? [r.wie_rijklaar] : []);
      partners.forEach((p) => {
        const klaar = (r.partners_klaar ?? []).some((k) => k.toUpperCase() === p.toUpperCase());
        if (!klaar) counts[p.toUpperCase()] = (counts[p.toUpperCase()] || 0) + 1;
      });
    });
    return counts;
  }, [autos]);

  async function stuurBericht(r: AfterSalesAuto) {
    if (!nieuwBericht.trim()) return;
    const entry = { tekst: nieuwBericht.trim(), op: new Date().toISOString(), door: mijnNaam };
    const nieuweLijst = [entry, ...(r.partner_updates ?? [])];
    setNieuwBericht('');
    await onUpdate({ ...r, partner_updates: nieuweLijst, partner_updates_gezien_op: new Date().toISOString() });
  }

  function toggleBool(r: AfterSalesAuto, veld: keyof AfterSalesAuto) {
    const nieuweWaarde = !r[veld];
    const extra: Partial<AfterSalesAuto> = {};
    if (veld === 'binnen') extra.binnen_op = nieuweWaarde ? vandaagStr() : undefined;
    if (veld === 'proefrit') extra.proefrit_op = nieuweWaarde ? vandaagStr() : undefined;
    onToggleMeta(r, veld, nieuweWaarde, extra);
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
    <>
      {/* Partner filter-chips */}
      {partnerLijst.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginRight: 4 }}>Partner:</span>
          <button
            className={`${styles.typeBtn} ${!partnerFilter ? styles.actief : ''}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => setPartnerFilter(null)}
          >Alle</button>
          {partnerLijst.map((naam) => {
            const aantal = partnerCounts[naam.toUpperCase()] ?? 0;
            return (
              <button
                key={naam}
                className={`${styles.typeBtn} ${partnerFilter === naam ? styles.actief : ''}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setPartnerFilter(partnerFilter === naam ? null : naam)}
              >{naam}{aantal > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>({aantal})</span>}</button>
            );
          })}
        </div>
      )}
    <div className={styles.tabelWrapper} onClick={() => { setAccPopupId(null); setPartnerPopupId(null); }}>
      {rijen.length === 0 ? <div className={styles.leeg}>Geen auto&apos;s {partnerFilter ? `bij ${partnerFilter}` : ''}</div> : (
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
          <th>Partner</th>
          <th className={styles.chk}>Aflctr.</th>
          <th className={styles.chk}>Klaar</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const accItems = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean);
            const accKlaar = (r.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean);
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
                  {(() => {
                    const partners = r.partners_toegewezen ?? (r.wie_rijklaar ? [r.wie_rijklaar] : []);
                    if (partners.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
                    const klaarLijst = r.partners_klaar ?? [];
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        {partners.map((naam) => {
                          const isKlaar = klaarLijst.some((p) => p.toUpperCase() === naam.toUpperCase());
                          return (
                            <button
                              key={naam}
                              className={`${styles.wieChip} ${isKlaar ? styles.wieKlaar : ''}`}
                              title={isKlaar ? `${naam} → klik om af te vinken` : `${naam} → klik om als klaar te markeren`}
                              onClick={() => {
                                const huidig = r.partners_klaar ?? [];
                                const upper = naam.toUpperCase();
                                const nieuw = isKlaar
                                  ? huidig.filter((p) => p.toUpperCase() !== upper)
                                  : [...huidig, naam];
                                onUpdate({ ...r, partners_klaar: nieuw });
                              }}
                              style={isKlaar ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                            >
                              {isKlaar && '✓ '}{naam}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </td>

                {/* Binnen */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <CbMeta aan={!!r.binnen} onClick={() => toggleBool(r, 'binnen')} meta={r.veld_meta?.['binnen']} accentKleur />
                    {r.binnen_op && <span className={styles.datumtje}>{datumFmt(r.binnen_op)}</span>}
                  </div>
                </td>

                {/* Proef */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <CbMeta aan={!!r.proefrit} onClick={() => toggleBool(r, 'proefrit')} meta={r.veld_meta?.['proefrit']} accentKleur />
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
                <td
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setAccPopupId(r.id); setPartnerPopupId(null); setNieuweAcc(''); }}
                >
                  {(() => {
                    if (accItems.length === 0) return <span className={styles.accLegen}>+ toevoegen</span>;
                    const open = accItems.filter((item) => !accKlaar.includes(item));
                    const klaarN = accKlaar.length;
                    if (open.length === 0) return <span className={styles.accAllesKlaar}>✓ alles klaar ({klaarN})</span>;
                    const max = 2;
                    const zichtbaar = open.slice(0, max);
                    const verborgen = open.length - zichtbaar.length;
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 100 }}>
                        {zichtbaar.map((item) => (
                          <span key={item} className={styles.accChip}>{item}</span>
                        ))}
                        {verborgen > 0 && (
                          <span className={styles.accMeerKnop} title={open.slice(max).join('\n')}>+{verborgen}</span>
                        )}
                        {klaarN > 0 && (
                          <span className={styles.accKlaarBadge} title={accKlaar.map((k) => '✓ ' + k).join('\n')}>✓ {klaarN}</span>
                        )}
                      </div>
                    );
                  })()}
                </td>

                {/* Partner */}
                <td
                  style={{ cursor: 'pointer', position: 'relative' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPartnerPopupId(r.id);
                    setAccPopupId(null);
                    if (heeftNieuweUpdate(r)) {
                      onUpdate({ ...r, partner_updates_gezien_op: new Date().toISOString() });
                    }
                  }}
                >
                  {heeftNieuweUpdate(r) && <span className={styles.notifDot} title="Nieuwe update van partner" />}
                  {(() => {
                    const partners = r.partners_toegewezen ?? (r.wie_rijklaar ? [r.wie_rijklaar] : []);
                    if (partners.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
                    const d = r.partner_binnen_op ? Math.floor((Date.now() - new Date(r.partner_binnen_op).getTime()) / 86400000) : null;
                    const dKleur = d === null ? '#63b3ed' : d <= 7 ? '#16a34a' : d <= 14 ? '#f97316' : '#dc2626';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 70, alignItems: 'flex-start' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                          background: r.partner_binnen ? `${dKleur}1A` : 'transparent',
                          color: r.partner_binnen ? dKleur : 'var(--muted)',
                          border: r.partner_binnen ? `1px solid ${dKleur}55` : '1px dashed var(--border)',
                          display: 'inline-block',
                        }}>
                          📍 {r.partner_binnen ? (d === null ? 'hier' : d === 0 ? 'vandaag' : `${d}d`) : 'nee'}
                        </span>
                        {(r.partner_updates ?? []).length > 0 && (
                          <span className={styles.partnerUpdatesBadge} title={r.partner_updates![0].tekst}>
                            💬 {r.partner_updates!.length}
                          </span>
                        )}
                        {r.partner_datum && (
                          <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            📅 {new Date(r.partner_datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>

                {/* Aflevercontrole */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <CbMeta aan={!!r.aflevercontrole} onClick={() => toggleBool(r, 'aflevercontrole')} meta={r.veld_meta?.['aflevercontrole']} />
                </td>

                {/* Klaar */}
                <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                  <CbMeta aan={!!r.klaar} onClick={() => toggleBool(r, 'klaar')} meta={r.veld_meta?.['klaar']} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}

      {/* ── Accessoires Modal (centered overlay) ── */}
      {accPopupId && typeof document !== 'undefined' && (() => {
        const r = rijen.find((row) => row.id === accPopupId);
        if (!r) return null;
        const items = (r.accessoires ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const klaarLijst = (r.accessoires_klaar ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const open = items.filter((item) => !klaarLijst.includes(item));
        const klaar = items.filter((item) => klaarLijst.includes(item));
        const toewijzingen = r.taak_toewijzingen ?? [];

        function taakRij(item: string, isKlaar: boolean) {
          const huidigPartner = toewijzingen.find((t) => t.taak === item)?.partner ?? null;
          function cyclePartner() {
            const idx = huidigPartner ? partnerLijst.indexOf(huidigPartner) : -1;
            const volgende = idx < partnerLijst.length - 1 ? partnerLijst[idx + 1] : null;
            const nieuwToewijzingen = toewijzingen.filter((t) => t.taak !== item);
            if (volgende) nieuwToewijzingen.push({ taak: item, partner: volgende });

            // Sync partners_toegewezen op basis van wie er nog taken heeft
            let nieuwePartners = [...(r!.partners_toegewezen ?? [])];
            // Verwijder oude partner als die geen andere taken meer heeft
            if (huidigPartner) {
              const heeftNogTaken = nieuwToewijzingen.some((t) => t.partner.toUpperCase() === huidigPartner.toUpperCase());
              if (!heeftNogTaken) {
                nieuwePartners = nieuwePartners.filter((p) => p.toUpperCase() !== huidigPartner.toUpperCase());
              }
            }
            // Voeg nieuwe partner toe als hij er nog niet bij staat
            if (volgende && !nieuwePartners.some((p) => p.toUpperCase() === volgende.toUpperCase())) {
              nieuwePartners.push(volgende);
            }

            onUpdate({ ...r!, taak_toewijzingen: nieuwToewijzingen, partners_toegewezen: nieuwePartners });
          }
          return (
            <div key={item} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              background: isKlaar ? 'rgba(22,163,74,0.04)' : 'transparent',
            }}>
              <div
                className={`${styles.cb} ${isKlaar ? styles.on : ''}`}
                style={{ flexShrink: 0, cursor: 'pointer' }}
                onClick={() => toggleAcc(r!, item)}
              >
                {isKlaar && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span style={{ flex: 1, fontSize: 14, color: isKlaar ? 'var(--muted)' : 'var(--text)', textDecoration: isKlaar ? 'line-through' : 'none' }}>{item}</span>
              {partnerLijst.length > 0 && (
                <button
                  className={styles.taakPartnerChip}
                  style={{ fontSize: 11, padding: '3px 10px', margin: 0 }}
                  onClick={cyclePartner}
                  title={huidigPartner ? `Toegewezen aan ${huidigPartner} — klik om te wijzigen` : 'Klik om partner toe te wijzen'}
                >
                  {huidigPartner ?? '— wie? —'}
                </button>
              )}
              <button className={styles.accVerwijder} onClick={() => verwijderAcc(r!, item)} title="Verwijder">×</button>
            </div>
          );
        }

        return createPortal(
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20, backdropFilter: 'blur(2px)',
            }}
            onClick={() => setAccPopupId(null)}
          >
            <div
              style={{
                background: 'var(--surface)', borderRadius: 18,
                maxWidth: 560, width: '100%', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: '1px solid var(--border)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <KentekenPlaat kenteken={r.kenteken} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      <span className={styles.kn}>{r.merk}</span> <span className={styles.modelAccent}>{r.model}</span>
                    </div>
                    {r.klant && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.klant}</div>}
                  </div>
                </div>
                <button onClick={() => setAccPopupId(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Te doen */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Te doen ({open.length})</div>
                  {open.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      {open.map((item) => taakRij(item, false))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Geen openstaande taken.</div>
                  )}
                </div>

                {/* Toevoegen */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Taak toevoegen</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="fi"
                      placeholder="bijv. Trekhaak monteren, Belettering, Inschrijven RDW..."
                      value={nieuweAcc}
                      onChange={(e) => setNieuweAcc(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && voegAccToe(r)}
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button className="btn btn-a" onClick={() => voegAccToe(r)} disabled={!nieuweAcc.trim()} style={{ whiteSpace: 'nowrap' }}>+ Toevoegen</button>
                  </div>
                </div>

                {/* Afgerond */}
                {klaar.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Afgerond ({klaar.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', opacity: 0.85 }}>
                      {klaar.map((item) => taakRij(item, true))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-a" onClick={() => setAccPopupId(null)}>Sluiten</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Partner Modal (centered overlay) ── */}
      {partnerPopupId && typeof document !== 'undefined' && (() => {
        const r = rijen.find((row) => row.id === partnerPopupId);
        if (!r) return null;
        const d = r.partner_binnen_op ? Math.floor((Date.now() - new Date(r.partner_binnen_op).getTime()) / 86400000) : null;
        return createPortal(
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20, backdropFilter: 'blur(2px)',
            }}
            onClick={() => setPartnerPopupId(null)}
          >
            <div
              style={{
                background: 'var(--surface)', borderRadius: 18,
                maxWidth: 560, width: '100%', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: '1px solid var(--border)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <KentekenPlaat kenteken={r.kenteken} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      <span className={styles.kn}>{r.merk}</span> <span className={styles.modelAccent}>{r.model}</span>
                    </div>
                    {r.klant && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.klant}</div>}
                  </div>
                </div>
                <button onClick={() => setPartnerPopupId(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Partners toewijzen + klaar */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Partners toewijzen</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {partnerLijst.map((naam) => {
                      const aan = (r.partners_toegewezen ?? []).includes(naam);
                      const klaar = (r.partners_klaar ?? []).some((p) => p.toUpperCase() === naam.toUpperCase());
                      return (
                        <button
                          key={naam}
                          className={`${styles.typeBtn} ${aan ? styles.actief : ''}`}
                          style={{ padding: '6px 14px', ...(klaar ? { opacity: 0.6, textDecoration: 'line-through' } : {}) }}
                          onClick={() => {
                            const huidig = r.partners_toegewezen ?? [];
                            const wordtToegevoegd = !huidig.includes(naam);
                            const nieuw = wordtToegevoegd ? [...huidig, naam] : huidig.filter((n) => n !== naam);
                            // Bij weghalen: ook de taak-toewijzingen voor deze partner opruimen
                            const nieuweToewijzingen = wordtToegevoegd
                              ? (r.taak_toewijzingen ?? [])
                              : (r.taak_toewijzingen ?? []).filter((t) => t.partner.toUpperCase() !== naam.toUpperCase());
                            onUpdate({ ...r, partners_toegewezen: nieuw, taak_toewijzingen: nieuweToewijzingen });
                          }}
                        >{klaar ? '✓ ' : ''}{naam}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Klik in tabel-kolom WIE om als klaar af te vinken.</div>
                </div>

                {/* Aanwezigheid + Datum side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Aanwezigheid</div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: r.partner_binnen ? 'rgba(22,163,74,0.05)' : 'transparent' }}
                      onClick={() => onUpdate({ ...r, partner_binnen: !r.partner_binnen, partner_binnen_op: !r.partner_binnen ? new Date().toISOString() : undefined })}
                    >
                      <div style={{ width: 36, height: 20, borderRadius: 10, background: r.partner_binnen ? 'var(--green)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 3, left: r.partner_binnen ? 17 : 3, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.3 }}>
                        <div style={{ color: 'var(--text)', fontWeight: 600 }}>{r.partner_binnen ? 'Bij partner' : 'Niet bij partner'}</div>
                        {r.partner_binnen && d !== null && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{d === 0 ? 'sinds vandaag' : `${d} dag${d !== 1 ? 'en' : ''}`}</div>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Ingepland op</div>
                    <input
                      type="date"
                      className={styles.datumInput}
                      value={r.partner_datum ?? ''}
                      onChange={(e) => onUpdate({ ...r, partner_datum: e.target.value || undefined })}
                      style={{ width: '100%', padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Onderdelen */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--text)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!r.partner_onderdelen_besteld}
                    onChange={(e) => onUpdate({ ...r, partner_onderdelen_besteld: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  Onderdelen besteld
                </label>

                {/* Bericht aan partner */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Bericht aan partner</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <textarea
                      className="fi"
                      placeholder="bijv. Wanneer kan de auto opgehaald worden?"
                      value={nieuwBericht}
                      onChange={(e) => setNieuwBericht(e.target.value)}
                      rows={2}
                      style={{ flex: 1, fontSize: 13, resize: 'vertical' }}
                    />
                    <button
                      className="btn btn-a"
                      onClick={() => stuurBericht(r)}
                      disabled={!nieuwBericht.trim()}
                      style={{ whiteSpace: 'nowrap' }}
                    >Versturen</button>
                  </div>
                </div>

                {/* Updates feed */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Historie</div>
                  {(r.partner_updates ?? []).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                      {(r.partner_updates ?? []).map((u, i) => {
                        const isIntern = !partnerLijst.some((p) => p.toUpperCase() === u.door.toUpperCase());
                        return (
                          <div key={i} style={{
                            padding: '10px 12px',
                            borderBottom: i < (r.partner_updates ?? []).length - 1 ? '1px solid var(--border)' : 'none',
                            background: isIntern ? 'rgba(146,25,57,0.04)' : 'transparent',
                          }}>
                            <div style={{ fontSize: 13, color: 'var(--text)' }}>{u.tekst}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              {new Date(u.op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} · <strong style={{ color: isIntern ? 'var(--accent)' : 'var(--muted)' }}>{u.door}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Nog geen historie.</div>
                  )}
                </div>
              </div>

              {/* WerkDerden offertes voor deze auto */}
              {(() => {
                const wdVoorAuto = wdRecords.filter((w) => w.after_sales_id === r.id);
                if (!wdVoorAuto.length) return null;
                const sk: Record<string, string> = { open: '#e2a200', goedgekeurd: '#32a868', afgekeurd: '#e05252', klaar_gemeld: '#32a868', afgerond: '#32a868', gefactureerd: '#32a868' };
                return (
                  <div style={{ marginTop: 16, padding: '0 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>WerkDerden offertes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {wdVoorAuto.map((w) => (
                        <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                          <div>
                            <span style={{ fontWeight: 600 }}>{w.partner}</span>
                            {w.notitie && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{w.notitie}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>{typeof w.inkoop_bedrag === 'number' ? w.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : '—'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, background: (sk[w.status] ?? '#888') + '22', color: sk[w.status] ?? '#888', borderRadius: 4, padding: '2px 8px' }}>{w.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-a" onClick={() => setPartnerPopupId(null)}>Sluiten</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
    </>
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
  const actief = autos.filter((r) => !r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  const tePlannen = actief.filter((r) => {
    if (r.afleverdatum) return false;
    return r.type === 'import'
      ? (r.binnen && r.aflevercontrole && r.klaar)
      : !!r.klaar;
  });
  const gepland = actief
    .filter((r) => !!r.afleverdatum)
    .sort((a, b) => (a.afleverdatum ?? '') < (b.afleverdatum ?? '') ? -1 : 1);

  if (!tePlannen.length && !gepland.length) return <div className={styles.leeg}>Geen geplande afleveringen</div>;

  const renderRij = (r: AfterSalesAuto) => (
    <tr key={r.id} onClick={() => onBewerken(r)} style={{ cursor: 'pointer' }}>
      <td><KentekenPlaat kenteken={r.kenteken} /></td>
      <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
      <td style={{ whiteSpace: 'nowrap' }}>{r.klant || '—'}</td>
      <td>{r.type ? <span className={`${styles.badge} ${TYPE_CSS[r.type]}`}>{TYPE_LABEL[r.type]}</span> : '—'}</td>
      <td style={{ fontWeight: 600, color: r.afleverdatum ? 'var(--green)' : '#b45309', whiteSpace: 'nowrap' }}>
        {r.afleverdatum ? `${datumFmt(r.afleverdatum)}${r.tijdstip_levering ? ` ${r.tijdstip_levering}` : ''}` : '— in te plannen'}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{r.wie_levert_af || '—'}</td>
      {AFLEVERING_CHECKS.map((s) => (
        <td key={s.veld} className={styles.chk}>
          <CbMeta aan={!!r[s.veld]} onClick={() => onToggle(r.id, s.veld)} meta={r.veld_meta?.[String(s.veld)]} />
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
  );

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
          {tePlannen.length > 0 && (
            <tr>
              <td colSpan={8 + AFLEVERING_CHECKS.length} style={{ background: 'rgba(180,83,9,.06)', color: '#b45309', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px' }}>
                Datum nog in te plannen ({tePlannen.length})
              </td>
            </tr>
          )}
          {tePlannen.map(renderRij)}
          {gepland.length > 0 && tePlannen.length > 0 && (
            <tr>
              <td colSpan={8 + AFLEVERING_CHECKS.length} style={{ background: 'rgba(22,163,74,.06)', color: 'var(--green)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px' }}>
                Gepland ({gepland.length})
              </td>
            </tr>
          )}
          {gepland.map(renderRij)}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Nalevering / Klachten ────────────────────────────────
type KlachtFormType = {
  kenteken: string; merk_model: string; klant: string;
  omschrijving: string; oplossing: string; door_wie: string;
  status: ASKlacht['status']; updates: KlachtUpdate[];
};
const leegKlachtForm = (): KlachtFormType => ({
  kenteken: '', merk_model: '', klant: '', omschrijving: '',
  oplossing: '', door_wie: '', status: 'in_behandeling', updates: [],
});

function DoorWieTip({ naam, aangemaakt }: { naam?: string; aangemaakt?: string }) {
  if (!naam) return <span style={{ color: 'var(--muted)' }}>—</span>;
  if (!aangemaakt) return <span>{naam}</span>;
  return (
    <PortalTip tip={
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        Aangemaakt {new Date(aangemaakt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
      </span>
    }>
      <span>{naam}</span>
    </PortalTip>
  );
}

function TabNalevering({ klachten, autos, zoek, onAddKlacht, onUpdateKlacht, onRemoveKlacht, gebruiker }: {
  klachten: ASKlacht[]; autos: AfterSalesAuto[]; zoek: string;
  onAddKlacht: (k: Omit<ASKlacht, 'id' | 'created_at'>) => Promise<unknown>;
  onUpdateKlacht: (k: ASKlacht) => Promise<void>;
  onRemoveKlacht: (id: string) => Promise<void>;
  gebruiker: string;
}) {
  const [nalTab, setNalTab] = useState<NalTab>('open');
  const [klachtModal, setKlachtModal] = useState(false);
  const [editKlacht, setEditKlacht] = useState<ASKlacht | null>(null);
  const [klachtForm, setKlachtForm] = useState<KlachtFormType>(leegKlachtForm());
  const [nieuweUpdate, setNieuweUpdate] = useState('');

  function openNieuw() {
    setEditKlacht(null);
    setKlachtForm(leegKlachtForm());
    setNieuweUpdate('');
    setKlachtModal(true);
  }
  function openEdit(k: ASKlacht) {
    setEditKlacht(k);
    setKlachtForm({
      kenteken: k.kenteken, merk_model: k.merk_model ?? '', klant: k.klant ?? '',
      omschrijving: k.omschrijving, oplossing: k.oplossing ?? '',
      door_wie: k.door_wie ?? '', status: k.status,
      updates: k.updates ?? [],
    });
    setNieuweUpdate('');
    setKlachtModal(true);
  }

  async function handleOpslaan() {
    if (!klachtForm.kenteken || !klachtForm.omschrijving) { alert('Vul kenteken en omschrijving in.'); return; }
    try {
      if (editKlacht) {
        await onUpdateKlacht({ ...editKlacht, ...klachtForm });
      } else {
        await onAddKlacht({ ...klachtForm, auto_id: '' });
      }
      setKlachtModal(false);
    } catch (e) {
      alert('Opslaan mislukt: ' + (e as Error).message);
    }
  }

  function handleAddUpdate() {
    const tekst = nieuweUpdate.trim();
    if (!tekst) return;
    const update: KlachtUpdate = { tekst, op: new Date().toISOString(), door: gebruiker || '?' };
    setKlachtForm((f) => ({ ...f, updates: [...f.updates, update] }));
    setNieuweUpdate('');
  }

  async function handleStatusChange(k: ASKlacht, nieuweStatus: ASKlacht['status']) {
    const extra: Partial<ASKlacht> = {};
    if (nieuweStatus === 'opgelost') {
      extra.opgelost_op = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      schietConfetti();
    }
    await onUpdateKlacht({ ...k, status: nieuweStatus, ...extra });
  }

  const gefilterdeKlachten = klachten.filter((k) => {
    const isOpen = k.status !== 'opgelost';
    if (nalTab === 'open' && !isOpen) return false;
    if (nalTab === 'opgelost' && isOpen) return false;
    if (zoek && !`${k.kenteken} ${k.klant} ${k.omschrijving}`.toLowerCase().includes(zoek.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className={styles.nalTabBalk}>
        <button className={`tab ${nalTab === 'open' ? 'on' : ''}`} onClick={() => setNalTab('open')}>Open klachten</button>
        <button className={`tab ${nalTab === 'opgelost' ? 'on' : ''}`} onClick={() => setNalTab('opgelost')}>✅ Opgelost</button>
        <div style={{ marginLeft: 'auto', padding: '8px 0' }}>
          <button className="btn btn-a" onClick={openNieuw}>+ Nalevering / Klacht</button>
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
              <th>Status</th><th>Laatste update</th><th>Door wie</th><th>Acties</th>
            </tr></thead>
            <tbody>
              {gefilterdeKlachten.map((k) => {
                const updates = k.updates ?? [];
                const laatsteUpdate = updates.length > 0 ? updates[updates.length - 1] : null;
                return (
                  <tr key={k.id} onClick={() => openEdit(k)}>
                    <td><KentekenPlaat kenteken={k.kenteken ?? ''} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{k.merk_model || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{k.klant || '—'}</td>
                    <td style={{ maxWidth: 220, fontSize: 12 }}>{k.omschrijving}</td>
                    <td style={{ maxWidth: 180, color: 'var(--muted)', fontSize: 12 }}>{k.oplossing || '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={styles.statusSelect}
                        value={k.status}
                        onChange={(e) => handleStatusChange(k, e.target.value as ASKlacht['status'])}
                      >
                        {KLACHT_STATUSSEN.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
                      </select>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {laatsteUpdate ? (
                        <PortalTip tip={<>
                          <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 12 }}>{laatsteUpdate.door}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {new Date(laatsteUpdate.op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} {new Date(laatsteUpdate.op).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{laatsteUpdate.tekst}</span>
                        </>}>
                          <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {new Date(laatsteUpdate.op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                            <span className={styles.updateBadge}>{updates.length}×</span>
                          </span>
                        </PortalTip>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {k.created_at ? new Date(k.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'}
                        </span>
                      )}
                    </td>
                    <td><DoorWieTip naam={k.door_wie} aangemaakt={k.created_at} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className={styles.bewerkLink} onClick={() => openEdit(k)}>✏ Bewerk</button>
                        {nalTab === 'opgelost' && (
                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleStatusChange(k, 'in_behandeling')}>↩ Terugzetten</button>
                        )}
                        <button className={styles.verwijderIcon} onClick={async () => { if (confirm('Klacht verwijderen?')) await onRemoveKlacht(k.id); }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Klacht modal */}
      {klachtModal && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setKlachtModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitel}>{editKlacht ? 'Nalevering bewerken' : 'Nalevering toevoegen'}</div>
              <button className={styles.sluitKnop} onClick={() => setKlachtModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {/* Rij 1: Kenteken + Merk/Model */}
              <div className={styles.fg}>
                <label>Kenteken</label>
                <input className="fi" value={klachtForm.kenteken} onChange={(e) => setKlachtForm((f) => ({ ...f, kenteken: e.target.value.toUpperCase() }))} />
              </div>
              <div className={styles.fg}>
                <label>Merk / Model</label>
                <input className="fi" value={klachtForm.merk_model} onChange={(e) => setKlachtForm((f) => ({ ...f, merk_model: e.target.value }))} />
              </div>
              {/* Rij 2: Klant + Door wie */}
              <div className={styles.fg}>
                <label>Klant</label>
                <input className="fi" value={klachtForm.klant} onChange={(e) => setKlachtForm((f) => ({ ...f, klant: e.target.value }))} />
              </div>
              <div className={styles.fg}>
                <label>Door wie aangemaakt</label>
                <select className="fi" value={klachtForm.door_wie} onChange={(e) => setKlachtForm((f) => ({ ...f, door_wie: e.target.value }))}>
                  <option value="">— Kies medewerker —</option>
                  {AS_MEDEWERKERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {/* Omschrijving */}
              <div className={`${styles.fg} ${styles.vol}`}>
                <label>Omschrijving klacht / nalevering</label>
                <textarea className="fi" rows={3} value={klachtForm.omschrijving} onChange={(e) => setKlachtForm((f) => ({ ...f, omschrijving: e.target.value }))} />
              </div>
              {/* Oplossing */}
              <div className={`${styles.fg} ${styles.vol}`}>
                <label>Geboden oplossing</label>
                <textarea className="fi" rows={2} value={klachtForm.oplossing} onChange={(e) => setKlachtForm((f) => ({ ...f, oplossing: e.target.value }))} />
              </div>
              {/* Status */}
              <div className={`${styles.fg} ${styles.vol}`}>
                <label>Status</label>
                <select className="fi" value={klachtForm.status} onChange={(e) => setKlachtForm((f) => ({ ...f, status: e.target.value as ASKlacht['status'] }))}>
                  {KLACHT_STATUSSEN.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
                </select>
              </div>
              {/* Historie / Verloop */}
              <div className={`${styles.fg} ${styles.vol}`}>
                <label className={styles.historieLabel}>Historie / Verloop</label>
                <div className={styles.updateLijst}>
                  {klachtForm.updates.length === 0 ? (
                    <span className={styles.updateLeeg}>Nog geen updates</span>
                  ) : (
                    klachtForm.updates.map((u, i) => (
                      <div key={i} className={styles.updateRij}>
                        <span className={styles.updateTekst}>{u.tekst}</span>
                        <span className={styles.updateMeta}>{u.door} · {new Date(u.op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} {new Date(u.op).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <textarea
                    className="fi"
                    rows={2}
                    placeholder="Nieuwe update toevoegen..."
                    value={nieuweUpdate}
                    onChange={(e) => setNieuweUpdate(e.target.value)}
                    style={{ flex: 1, resize: 'vertical' }}
                  />
                  <button className="btn btn-a" style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }} onClick={handleAddUpdate}>+ Update</button>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              {editKlacht && <button className={styles.verwijderKnop} onClick={async () => { if (confirm('Klacht verwijderen?')) { await onRemoveKlacht(editKlacht.id); setKlachtModal(false); } }}>🗑 Verwijder</button>}
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
function TabArchief({ autos, zoek, onEdit, onTerugzetten }: {
  autos: AfterSalesAuto[]; zoek: string;
  onEdit: (r: AfterSalesAuto) => void;
  onTerugzetten: (r: AfterSalesAuto) => void;
}) {
  const rijen = autos.filter((r) => r.gearchiveerd && (!zoek || zoekMatch(r, zoek)));
  if (!rijen.length) return <div className={styles.leeg}>Archief is leeg</div>;
  return (
    <div className={styles.tabelWrapper}>
      <table className={styles.tabel}>
        <thead><tr>
          <th>Kenteken</th><th>Merk / Model</th><th>Klant</th><th>Type</th>
          <th>Afgeleverd op</th><th>Stadagen</th><th>Wie heeft afgeleverd</th><th>Acties</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              <td><KentekenPlaat kenteken={r.kenteken ?? ''} /></td>
              <td><div className={styles.kn}>{r.merk}</div><div className={styles.ks}>{r.model}</div></td>
              <td>{r.klant}</td>
              <td>{r.type || '—'}</td>
              <td>{datumFmt(r.afgeleverd_op)}</td>
              <td><StaDagen datum={r.binnen_op} tot={r.afgeleverd_op} /></td>
              <td>{r.wie_heeft_afgeleverd || r.wie_levert_af || '—'}</td>
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

// ── BTW/Credit nieuw popup ────────────────────────────────────
function BtwCreditNieuwPopup({ auto, onBevestig, onAnnuleer }: {
  auto: AfterSalesAuto | Omit<AfterSalesAuto, 'id' | 'created_at'>;
  onBevestig: (type: BtwAutoType, dealerVerkoper: string, bedrag?: number) => Promise<void>;
  onAnnuleer: () => void;
}) {
  const [type, setType] = useState<BtwAutoType>('btw');
  const [dealerVerkoper, setDealerVerkoper] = useState('');
  const [bedrag, setBedrag] = useState('');
  const [laden, setLaden] = useState(false);

  async function bevestig() {
    setLaden(true);
    await onBevestig(type, dealerVerkoper, bedrag ? parseFloat(bedrag.replace(',', '.')) : undefined);
    setLaden(false);
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onAnnuleer()}>
      <div className={styles.modal} style={{ maxWidth: 480 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>📋 BTW / Credit toevoegen</div>
          <button className={styles.sluitKnop} onClick={onAnnuleer}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={`${styles.fg} ${styles.vol}`} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>{auto.merk} {auto.model}</span>
            {auto.klant ? <span style={{ color: 'var(--muted)' }}> · {auto.klant}</span> : null}
          </div>
          <div className={styles.fg}>
            <label>Type</label>
            <select className="fi" value={type} onChange={(e) => setType(e.target.value as BtwAutoType)}>
              <option value="btw">💳 BTW</option>
              <option value="credit">📄 Credit</option>
            </select>
          </div>
          <div className={styles.fg}>
            <label>Waarvandaan (dealer / verkoper)</label>
            <input className="fi" placeholder="bijv. Pon, VW Dealer Amsterdam..." value={dealerVerkoper} onChange={(e) => setDealerVerkoper(e.target.value)} />
          </div>
          <div className={styles.fg}>
            <label>Bedrag (optioneel)</label>
            <input className="fi" type="text" inputMode="decimal" placeholder="bijv. 1500" value={bedrag} onChange={(e) => setBedrag(e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn" onClick={onAnnuleer}>Overslaan</button>
          <button className="btn btn-a" onClick={bevestig} disabled={laden}>{laden ? 'Opslaan...' : '+ Toevoegen aan BTW/Credit'}</button>
        </div>
      </div>
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
  const { autos, klachten, loading, gebruiker, addAuto, updateAuto, removeAuto, toggleAuto, toggleAutoMeta, addKlacht, updateKlacht, removeKlacht } = useAfterSales();
  const { records: wdRecords, bijlageUrl } = useWerkDerden();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<HoofdTab>(
    (searchParams.get('tab') as HoofdTab) || 'lopend'
  );
  const [zoek, setZoek] = useState('');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AfterSalesAuto | null>(null);
  const [afleverAuto, setAfleverAuto] = useState<{ auto: AfterSalesAuto; bewerken: boolean } | null>(null);
  const [btwAuto, setBtwAuto] = useState<AfterSalesAuto | Omit<AfterSalesAuto, 'id' | 'created_at'> | null>(null);

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
    const wasNietInBtw = !editRecord?.btw_credit;
    if ('id' in rec) await updateAuto(rec as AfterSalesAuto);
    else await addAuto(rec);
    if (wasNietInBtw && rec.btw_credit) setBtwAuto(rec);
  }

  async function handleBtwBevestig(type: BtwAutoType, dealerVerkoper: string, bedrag?: number) {
    if (!btwAuto) return;
    const vandaag = new Date().toISOString().slice(0, 10);
    const btwRec = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      kenteken: btwAuto.kenteken,
      auto: `${btwAuto.merk ?? ''} ${btwAuto.model ?? ''}`.trim() || btwAuto.kenteken,
      type,
      klant: btwAuto.klant ?? '',
      dealer_verkoper: dealerVerkoper,
      ingekocht_op: vandaag,
      bedrag: bedrag ?? null,
      inkoper: btwAuto.wie_levert_af ?? '',
      gelangenbest_verstuurd: false,
      geld_van_lm: false,
      geld_van_dealer: false,
      gearchiveerd: false,
      veld_meta: {},
    };
    const { error } = await supabase.from('btw_records').insert(btwRec);
    if (error) console.error('BTW insert fout:', error);
    setBtwAuto(null);
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
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setKpiFilter(null); }}>{l}</button>
        ))}
        <div className={styles.subTabBalkRechts}>
          <input className={styles.zoekbalk} placeholder="Zoeken in after sales..." value={zoek} onChange={(e) => setZoek(e.target.value)} />
          {tab !== 'nalevering' && tab !== 'archief' && (
            <button className="btn btn-a" onClick={openNieuw}>+ Auto toevoegen</button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip autos={autos} klachten={klachten} onKpiKlik={(t, f) => { setTab(t); setKpiFilter(f ?? null); }} />

      {/* Tab inhoud */}
      {loading ? (
        <div className={styles.leeg}>Laden...</div>
      ) : (
        <>
          {tab === 'lopend'    && <TabLopend    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} onAfleveren={(r) => setAfleverAuto({ auto: r, bewerken: false })} />}
          {tab === 'import'   && <TabImport    autos={autos} zoek={zoek} onEdit={openEdit} onToggle={toggleAuto} onUpdate={updateAuto} />}
          {tab === 'rijklaar' && <TabRijklaar  autos={autos} zoek={zoek} kpiFilter={kpiFilter} onEdit={openEdit} onUpdate={updateAuto} onToggleMeta={toggleAutoMeta} />}
          {tab === 'gepland'  && <TabGepland   autos={autos} zoek={zoek} onToggle={toggleAuto} onBewerken={(r) => setAfleverAuto({ auto: r, bewerken: true })} onAfgeleverd={handleAfgeleverd} />}
          {tab === 'nalevering' && <TabNalevering klachten={klachten} autos={autos} zoek={zoek} onAddKlacht={addKlacht} onUpdateKlacht={updateKlacht} onRemoveKlacht={removeKlacht} gebruiker={gebruiker} />}
          {tab === 'archief'  && <TabArchief   autos={autos} zoek={zoek} onEdit={openEdit} onTerugzetten={(r) => updateAuto({ ...r, gearchiveerd: false, afgeleverd_op: undefined, wie_heeft_afgeleverd: undefined })} />}
        </>
      )}

      {/* Modal */}
      <AfterSalesModal
        record={editRecord}
        open={modalOpen}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={removeAuto}
        onAfleveren={(r) => { setModalOpen(false); setAfleverAuto({ auto: r, bewerken: false }); }}
        werkDerden={editRecord ? wdRecords.filter((w) => w.after_sales_id === editRecord.id) : []}
        onBijlageUrl={bijlageUrl}
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

      {/* BTW/Credit popup na opslaan met vinkje */}
      {btwAuto && (
        <BtwCreditNieuwPopup
          auto={btwAuto}
          onBevestig={handleBtwBevestig}
          onAnnuleer={() => setBtwAuto(null)}
        />
      )}
    </div>
  );
}
