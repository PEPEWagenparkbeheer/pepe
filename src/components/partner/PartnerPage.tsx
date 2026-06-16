'use client';

import { useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import { useAuth } from '@/hooks/useAuth';
import { createPortal } from 'react-dom';
import type { AfterSalesAuto, WerkDerdenRecord } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import PartnerModal from './PartnerModal';
import WerkDerdenModal from './WerkDerdenModal';
import styles from './PartnerPage.module.css';

type Tab = 'actief' | 'klaar' | 'werkzaamheden';

/** Een auto is "klaar" voor deze partner als:
 *  - partner in partners_klaar (nieuwe systeem), OF
 *  - wie_rijklaar_klaar=true én wie_rijklaar matcht (oude systeem), OF
 *  - de auto in PEPE algemeen klaar/gearchiveerd is */
function isKlaarVoorPartner(r: AfterSalesAuto, wieUpper: string): boolean {
  const inPartnersKlaar = (r.partners_klaar ?? []).some((p) => p.toUpperCase() === wieUpper);
  const inWieRijklaarKlaar = !!r.wie_rijklaar_klaar && r.wie_rijklaar?.toUpperCase() === wieUpper;
  return inPartnersKlaar || inWieRijklaarKlaar || !!r.klaar || !!r.gearchiveerd;
}

const TYPE_LABEL: Record<string, string> = { import: 'Import', nl: 'NL', nieuw: 'Nieuw', voorraad: 'Voorraad' };
const TYPE_CSS:   Record<string, string> = { import: styles.typeImport, nl: styles.typeNl, nieuw: styles.typeNieuw, voorraad: styles.typeVoorraad };

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}

export default function PartnerPage({ wie }: { wie: string }) {
  const { autos, updateAuto } = useAfterSales();
  const { signOut } = useAuth();
  const { records: wdRecords, addRecord: wdAddRecord, setKlaarGemeld, bijlageUrl } = useWerkDerden(wie);
  const [wdModalOpen, setWdModalOpen] = useState(false);
  const [klaarBezig, setKlaarBezig] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<WerkDerdenRecord | null>(null);
  const [bijlageSignedUrl, setBijlageSignedUrl] = useState<string | null>(null);
  const [gezienIds, setGezienIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      return new Set(JSON.parse(localStorage.getItem('pepe_wd_gezien') ?? '[]') as string[]);
    } catch { return new Set<string>(); }
  });
  const markeerGezien = (id: string) => {
    setGezienIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('pepe_wd_gezien', JSON.stringify([...next]));
      return next;
    });
  };
  async function openDetail(r: WerkDerdenRecord) {
    markeerGezien(r.id);
    setDetailRecord(r);
    setBijlageSignedUrl(null);
    if (r.bijlage_storage_path) {
      const url = await bijlageUrl(r.bijlage_storage_path);
      setBijlageSignedUrl(url);
    }
  }

  // Records die actie van de partner vereisen (goedgekeurd → klaar melden)
  const wdActieCount = wdRecords.filter(r => r.status === 'goedgekeurd').length;
  const goedgekeurdeWdRecords = wdRecords.filter(r => r.status === 'goedgekeurd');
  const [modalAuto, setModalAuto] = useState<AfterSalesAuto | null>(null);
  const [tab, setTab] = useState<Tab>('actief');

  const wieUpper = wie.toUpperCase();

  // Alle auto's waarbij deze partner ooit betrokken was (toegewezen of via wie_rijklaar)
  const alleVoorPartner = autos.filter((r) => {
    const inToegewezen = (r.partners_toegewezen ?? []).some((p) => p.toUpperCase() === wieUpper);
    const inWieRijklaar = r.wie_rijklaar?.toUpperCase() === wieUpper;
    return inToegewezen || inWieRijklaar;
  });

  const actieveAutos = alleVoorPartner
    .filter((r) => !r.gearchiveerd && r.binnen && !isKlaarVoorPartner(r, wieUpper))
    .sort((a, b) => {
      if (!!a.partner_binnen !== !!b.partner_binnen) return a.partner_binnen ? -1 : 1;
      return (a.binnen_op ?? '') < (b.binnen_op ?? '') ? -1 : 1;
    });

  const klareAutos = alleVoorPartner
    .filter((r) => isKlaarVoorPartner(r, wieUpper))
    .sort((a, b) => {
      // Nieuwste klaar eerst — laatste partner_update is een goede proxy
      const aDatum = a.partner_updates?.[0]?.op ?? a.binnen_op ?? '';
      const bDatum = b.partner_updates?.[0]?.op ?? b.binnen_op ?? '';
      return aDatum > bDatum ? -1 : 1;
    });

  const mijnAutos = tab === 'actief' ? actieveAutos : tab === 'klaar' ? klareAutos : [];

  return (
    <div className={styles.pagina}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLogo}>
          <img src="/pepe-logo-cmyk-wit.svg" alt="PEPE" className={styles.logoImg} />
          <span className={styles.headerSub}>Rijklaar portaal — {wie}</span>
        </div>
        <button className={styles.uitlogKnop} onClick={signOut}>Uitloggen</button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'actief' ? styles.tabActief : ''}`}
          onClick={() => setTab('actief')}
        >
          Actief
          <span className={styles.tabBadge}>{actieveAutos.length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'klaar' ? styles.tabActief : ''}`}
          onClick={() => setTab('klaar')}
        >
          Archief — klaar gemeld
          <span className={styles.tabBadge}>{klareAutos.length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === "werkzaamheden" ? styles.tabActief : ''}`}
          onClick={() => setTab('werkzaamheden')}
        >
          Openstaand
          {wdActieCount > 0 && <span className={styles.tabBadge}>{wdActieCount}</span>}
        </button>
      </div>

      {/* Auto-tabel — alleen voor actief/klaar tabs */}
      {tab !== 'werkzaamheden' && (
      <div className={styles.content}>
        {tab === 'actief' && goedgekeurdeWdRecords.length > 0 && (
          <div className={styles.meldingNotificatieBlok}>
            <div className={styles.meldingNotificatieTitel}>
              <span className={styles.notificatieDot} />
              Goedgekeurde meldingen — klaar melden vereist
            </div>
            {goedgekeurdeWdRecords.map(wd => {
              const voertuig = wd.kenteken ?? wd.meldcode ?? '—';
              const gezien = gezienIds.has(wd.id);
              return (
                <div key={wd.id} className={styles.meldingNotificatieRij} onClick={() => openDetail(wd)}>
                  <span className={gezien ? styles.notificatieDotGezien : styles.notificatieDotBlink} />
                  <div style={{ flex: 1 }}>
                    <strong>{voertuig}</strong>
                    {wd.klant ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {wd.klant}</span> : ''}
                    {(wd.merk || wd.model) ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {[wd.merk, wd.model].filter(Boolean).join(' ')}</span> : ''}
                  </div>
                  <span className={styles.meldingKlaarBtn}>Klaar melden →</span>
                </div>
              );
            })}
          </div>
        )}
        {mijnAutos.length === 0 ? (
          <div className={styles.leeg}>
            {tab === 'actief'
              ? `Geen openstaande auto's voor ${wie}`
              : `Nog geen klaar gemelde auto's voor ${wie}`}
          </div>
        ) : (
          <div className={styles.tabelWrapper}>
            <table className={styles.tabel}>
              <thead>
                <tr>
                  <th>Kenteken</th>
                  <th>Merk / Model</th>
                  <th className={styles.mobielVerbergen}>Klant</th>
                  <th className={styles.mobielVerbergen}>Type</th>
                  <th className={styles.mobielVerbergen}>Staat hier</th>
                  <th className={styles.mobielVerbergen}>Ingepland</th>
                  <th className={styles.mobielVerbergen}>Onderdelen</th>
                  <th className={styles.mobielVerbergen}>Updates</th>
                </tr>
              </thead>
              <tbody>
                {mijnAutos.map((r) => {
                  const updates = r.partner_updates ?? [];
                  const wieKlaar = (r.partners_klaar ?? []).some((p) => p.toUpperCase() === wieUpper);
                  return (
                    <tr
                      key={r.id}
                      className={wieKlaar ? styles.rijKlaar : ''}
                      onClick={() => setModalAuto(r)}
                    >
                      <td><KentekenPlaat kenteken={r.kenteken} /></td>
                      <td>
                        <span className={styles.merk}>{r.merk}</span>{' '}
                        <span className={styles.model}>{r.model}</span>
                        {/* Mobiel: toon klant + status compact onder merk/model */}
                        <div className={styles.mobielSub}>
                          {r.klant && <span>{r.klant}</span>}
                          {r.type && <span className={`${styles.badge} ${TYPE_CSS[r.type] ?? ''}`}>{TYPE_LABEL[r.type] ?? r.type}</span>}
                          {r.partner_binnen && <span className={styles.binnenBadge}>📍 Staat hier</span>}
                          {r.partner_datum && <span style={{ color: 'var(--green)', fontWeight: 600 }}>📅 {datumFmt(r.partner_datum)}</span>}
                          {r.partner_onderdelen_besteld && <span className={styles.ondelBadge}>✓ Besteld</span>}
                          {updates.length > 0 && <span className={styles.updatesBadge}>💬 {updates.length}</span>}
                        </div>
                      </td>
                      <td className={styles.mobielVerbergen}>{r.klant || '—'}</td>
                      <td className={styles.mobielVerbergen}>
                        {r.type
                          ? <span className={`${styles.badge} ${TYPE_CSS[r.type] ?? ''}`}>{TYPE_LABEL[r.type] ?? r.type}</span>
                          : '—'}
                      </td>
                      <td className={styles.mobielVerbergen}>
                        {r.partner_binnen ? (() => {
                          const dagen = r.partner_binnen_op
                            ? Math.floor((Date.now() - new Date(r.partner_binnen_op).getTime()) / 86400000)
                            : null;
                          const tip = r.partner_binnen_op
                            ? `Binnen sinds ${new Date(r.partner_binnen_op).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })} · ${dagen === 0 ? 'vandaag' : `${dagen} dag${dagen !== 1 ? 'en' : ''}`}`
                            : undefined;
                          return <span className={styles.binnenBadge} title={tip}>📍 {dagen !== null ? (dagen === 0 ? 'vandaag' : `${dagen}d`) : 'Ja'}</span>;
                        })()
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td className={styles.mobielVerbergen} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {r.partner_datum ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{datumFmt(r.partner_datum)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td className={styles.mobielVerbergen}>
                        {r.partner_onderdelen_besteld
                          ? <span className={styles.ondelBadge}>✓ Besteld</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td className={styles.mobielVerbergen}>
                        {updates.length > 0
                          ? <span className={styles.updatesBadge}>{updates.length} update{updates.length !== 1 ? 's' : ''}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Werkzaamheden tab */}
      {tab === 'werkzaamheden' && (
        <div className={styles.content}>
          {wdRecords.length === 0 ? (
            <div className={styles.leeg}>Nog geen meldingen ingediend.</div>
          ) : (
            <div className={styles.tabelWrapper}>
              <table className={styles.tabel}>
                <thead>
                  <tr>
                    <th>Kenteken</th>
                    <th>Datum</th>
                    <th className={styles.mobielVerbergen}>Bedrag (excl. BTW)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wdRecords.map((r) => {
                    const voertuig = r.kenteken ?? r.meldcode ?? '—';
                    return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                      <td>
                        <strong>{voertuig}</strong>
                        {r.klant ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {r.klant}</span> : ''}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                      </td>
                      <td className={styles.mobielVerbergen}>
                        {r.inkoop_bedrag != null ? r.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : '—'}
                      </td>
                      <td>
                        <span className={
                          r.status === 'gefactureerd' ? styles.stGefactureerd :
                          r.status === 'afgekeurd' ? styles.stAfgekeurd :
                          r.status === 'goedgekeurd' || r.status === 'klaar_gemeld' ? styles.stGoedgekeurd :
                          styles.stOpen
                        }>
                          {r.status === 'gefactureerd' ? '✓ Gefactureerd' :
                           r.status === 'afgekeurd' ? '✕ Afgekeurd' :
                           r.status === 'klaar_gemeld' ? '✓ Klaar gemeld' :
                           r.status === 'goedgekeurd' ? '✓ Goedgekeurd' :
                           '⏳ Openstaand'}
                        </span>
                        {r.status === 'afgekeurd' && r.afkeur_reden && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.afkeur_reden}</div>
                        )}
                        {r.status === 'goedgekeurd' && (
                          <button
                            onClick={async () => {
                              setKlaarBezig(r.id);
                              await setKlaarGemeld(r.id);
                              setKlaarBezig(null);
                            }}
                            disabled={klaarBezig === r.id}
                            style={{
                              display: 'block',
                              marginTop: 6,
                              padding: '5px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--accent)',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: klaarBezig === r.id ? 'not-allowed' : 'pointer',
                              opacity: klaarBezig === r.id ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {klaarBezig === r.id ? 'Bezig…' : '✓ Klaar melden'}
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating + knop — altijd zichtbaar, opent melding-formulier */}
      <button className={styles.fabKnop} onClick={() => setWdModalOpen(true)} title='Kosten melden'>+</button>

      {modalAuto && (
        <PartnerModal
          auto={modalAuto}
          wie={wie}
          onSluiten={() => setModalAuto(null)}
          onOpslaan={async (bijgewerkt) => {
            await updateAuto(bijgewerkt);
            setModalAuto(bijgewerkt);
          }}
        />
      )}

      {wdModalOpen && (
        <WerkDerdenModal
          wie={wie}
          onSluiten={() => setWdModalOpen(false)}
          onIngediend={() => setWdModalOpen(false)}
          addRecord={wdAddRecord}
        />
      )}

      {detailRecord && createPortal(
        <div
          onClick={() => setDetailRecord(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 9999, boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)', borderRadius: 12, width: '100%',
              maxWidth: 520, maxHeight: '85vh', overflow: 'auto',
              border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detailRecord.kenteken ?? detailRecord.meldcode ?? '—'}</div>
                {detailRecord.klant && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{detailRecord.klant}</div>}
                {(detailRecord.merk || detailRecord.model) && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{[detailRecord.merk, detailRecord.model].filter(Boolean).join(' ')}</div>
                )}
              </div>
              <button onClick={() => setDetailRecord(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: '0 0 0 16px' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 6 }}>Status</div>
                <span className={
                  detailRecord.status === 'gefactureerd' ? styles.stGefactureerd :
                  detailRecord.status === 'afgekeurd' ? styles.stAfgekeurd :
                  detailRecord.status === 'goedgekeurd' || detailRecord.status === 'klaar_gemeld' ? styles.stGoedgekeurd :
                  styles.stOpen
                }>
                  {detailRecord.status === 'gefactureerd' ? '✓ Gefactureerd' :
                   detailRecord.status === 'afgekeurd' ? '✕ Afgekeurd' :
                   detailRecord.status === 'klaar_gemeld' ? '✓ Klaar gemeld' :
                   detailRecord.status === 'goedgekeurd' ? '✓ Goedgekeurd' :
                   '⏳ Openstaand'}
                </span>
                {detailRecord.status === 'afgekeurd' && detailRecord.afkeur_reden && (
                  <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>{detailRecord.afkeur_reden}</div>
                )}
              </div>

              {/* Kostenregels */}
              {detailRecord.regels.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Kostenregels</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {detailRecord.regels.map((regel, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < detailRecord.regels.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 14 }}>
                        <span>{regel.omschrijving}</span>
                        <span style={{ fontWeight: 600 }}>{regel.bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                    ))}
                    {detailRecord.inkoop_bedrag != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, fontWeight: 700 }}>
                        <span>Totaal excl. BTW</span>
                        <span>{detailRecord.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Toelichting */}
              {detailRecord.notitie && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 6 }}>Toelichting</div>
                  <div style={{ fontSize: 14 }}>{detailRecord.notitie}</div>
                </div>
              )}

              {/* Bijlage */}
              {detailRecord.bijlage_storage_path && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 6 }}>Bijlage</div>
                  {bijlageSignedUrl
                    ? <a href={bijlageSignedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'underline' }}>📎 Bijlage openen</a>
                    : <span style={{ fontSize: 14, color: 'var(--muted)' }}>Laden…</span>}
                </div>
              )}
            </div>

            {/* Footer — Klaar melden knop */}
            {detailRecord.status === 'goedgekeurd' && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={async () => {
                    setKlaarBezig(detailRecord.id);
                    await setKlaarGemeld(detailRecord.id);
                    setKlaarBezig(null);
                    setDetailRecord(null);
                  }}
                  disabled={klaarBezig === detailRecord.id}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 8,
                    border: 'none', background: 'var(--accent)', color: '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: klaarBezig === detailRecord.id ? 'not-allowed' : 'pointer',
                    opacity: klaarBezig === detailRecord.id ? 0.6 : 1,
                  }}
                >
                  {klaarBezig === detailRecord.id ? 'Bezig…' : '✓ Klaar melden'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}



