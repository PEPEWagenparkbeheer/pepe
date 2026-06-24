'use client';

import { useEffect, useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import { useAuth } from '@/hooks/useAuth';
import { isPepeOpdracht } from '@/lib/werk-derden/richting';
import type { AfterSalesAuto, WerkDerdenRecord } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import PartnerModal from './PartnerModal';
import WerkDerdenModal from './WerkDerdenModal';
import WerkDerdenDetailModal from './WerkDerdenDetailModal';
import styles from './PartnerPage.module.css';

type Tab = 'actief' | 'klaar';

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

  // body heeft overflow:hidden (globals.css) — reset zodat iOS Safari normaal scrolt
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
    };
  }, []);
  const { records: wdRecords, addRecord: wdAddRecord, updateRecord: wdUpdateRecord, setKlaarGemeld, setGeaccepteerd, bijlageUrl } = useWerkDerden(wie);
  const [wdModalOpen, setWdModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<WerkDerdenRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<WerkDerdenRecord | null>(null);
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
  function openDetail(r: WerkDerdenRecord) {
    markeerGezien(r.id);
    setDetailRecord(r);
  }

  // Records die actie van de partner vereisen (open PEPE-opdracht → accepteren)
  const teAccepterenRecords = wdRecords.filter(r => r.status === 'open' && isPepeOpdracht(r));

  const [modalAuto, setModalAuto] = useState<AfterSalesAuto | null>(null);
  const [offerteAuto, setOfferteAuto] = useState<AfterSalesAuto | null>(null);
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

  // Werkzaamheden/openstaand: te accepteren bovenaan, daarna lopend, daarna afgehandeld.
  const wdPrioriteit = (r: WerkDerdenRecord): number => {
    if (r.status === 'open' && isPepeOpdracht(r)) return 0; // te accepteren (urgentst)
    if (r.status === 'goedgekeurd') return 1;               // klaar te melden
    if (r.status === 'klaar_gemeld') return 2;
    if (r.status === 'open') return 3;                       // eigen indiening, wacht op PEPE
    if (r.status === 'afgekeurd') return 4;
    return 5;                                                // gefactureerd / afgerond
  };
  const wdGesorteerd = [...wdRecords].sort((a, b) => {
    const p = wdPrioriteit(a) - wdPrioriteit(b);
    if (p !== 0) return p;
    return (b.created_at ?? '') < (a.created_at ?? '') ? -1 : 1;
  });

  // ── Gedeelde render-helpers ─────────────────────────────────────────────
  function autoRij(r: AfterSalesAuto) {
    const updates = r.partner_updates ?? [];
    const wieKlaar = (r.partners_klaar ?? []).some((p) => p.toUpperCase() === wieUpper);
    return (
      <tr key={r.id} className={wieKlaar ? styles.rijKlaar : ''} onClick={() => setModalAuto(r)}>
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
  }

  function autoTabel(list: AfterSalesAuto[]) {
    return (
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
          <tbody>{list.map(autoRij)}</tbody>
        </table>
      </div>
    );
  }

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
      </div>

      {/* ── Actief: auto's bovenaan, werkzaamheden/openstaand eronder ── */}
      {tab === 'actief' && (
        <div className={styles.content}>
          {teAccepterenRecords.length > 0 && (
            <div style={{
              margin: '0 0 14px', padding: '10px 14px', borderRadius: 10,
              background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)',
              color: '#92400e', fontWeight: 600, fontSize: 14,
            }}>
              🔔 {teAccepterenRecords.length} nieuwe opdracht{teAccepterenRecords.length === 1 ? '' : 'en'} te accepteren — zie “Werkzaamheden &amp; kosten” onderaan
            </div>
          )}

          {/* Auto's */}
          <h3 className={styles.sectieKop}>Auto&apos;s</h3>
          {actieveAutos.length === 0
            ? <div className={styles.leeg}>Geen openstaande auto&apos;s voor {wie}</div>
            : autoTabel(actieveAutos)}

          {/* Werkzaamheden & kosten (incl. openstaande opdrachten) */}
          <h3 className={styles.sectieKop} style={{ marginTop: 26 }}>Werkzaamheden &amp; kosten</h3>
          {wdGesorteerd.length === 0 ? (
            <div className={styles.leeg}>Nog geen meldingen — tik op + om een kostenmelding te maken.</div>
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
                  {wdGesorteerd.map((r) => {
                    const voertuig = r.kenteken ?? r.meldcode ?? '—';
                    const isOpdracht = r.status === 'open' && isPepeOpdracht(r);
                    const teAcc = isOpdracht && !gezienIds.has(r.id);
                    return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => {
                      // PEPE-opdracht (open) → accepteren via detail; eigen open/afgekeurd → bewerken
                      if (r.status === 'open' && isPepeOpdracht(r)) openDetail(r);
                      else if (r.status === 'open' || r.status === 'afgekeurd') setEditRecord(r);
                      else openDetail(r);
                    }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{voertuig}</strong>
                          {teAcc && <span className={styles.notificatieDotBlink} title="Nieuwe opdracht — accepteren" />}
                          {r.klant ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {r.klant}</span> : ''}
                        </div>
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
                           isOpdracht ? '🔔 Te accepteren' :
                           '⏳ Openstaand'}
                        </span>
                        {r.status === 'afgekeurd' && r.afkeur_reden && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.afkeur_reden}</div>
                        )}
                        {(r.status === 'open' || r.status === 'afgekeurd') && (
                          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                            {r.status === 'afgekeurd' ? 'Klik om aan te passen' : isOpdracht ? 'Klik om te accepteren' : 'Klik om te bewerken'}
                          </div>
                        )}
                        {r.status === 'goedgekeurd' && (
                          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>Klik om klaar te melden</div>
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

      {/* ── Archief: klaar gemelde auto's ── */}
      {tab === 'klaar' && (
        <div className={styles.content}>
          {klareAutos.length === 0
            ? <div className={styles.leeg}>Nog geen klaar gemelde auto&apos;s voor {wie}</div>
            : autoTabel(klareAutos)}
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
          onOfferteVersturen={(auto) => { setModalAuto(null); setOfferteAuto(auto); }}
        />
      )}

      {wdModalOpen && (
        <WerkDerdenModal
          wie={wie}
          onSluiten={() => setWdModalOpen(false)}
          onIngediend={() => setWdModalOpen(false)}
          addRecord={wdAddRecord}
          afterSalesAutos={alleVoorPartner}
        />
      )}

      {offerteAuto && (
        <WerkDerdenModal
          wie={wie}
          vastAuto={offerteAuto}
          onSluiten={() => setOfferteAuto(null)}
          onIngediend={() => setOfferteAuto(null)}
          addRecord={wdAddRecord}
        />
      )}

      {editRecord && (
        <WerkDerdenModal
          wie={wie}
          record={editRecord}
          onSluiten={() => setEditRecord(null)}
          onIngediend={() => setEditRecord(null)}
          addRecord={wdAddRecord}
          afterSalesAutos={alleVoorPartner}
          updateRecord={wdUpdateRecord}
        />
      )}

      {detailRecord && (
        <WerkDerdenDetailModal
          record={detailRecord}
          bijlageUrl={bijlageUrl}
          onSluiten={() => setDetailRecord(null)}
          onKlaarMelden={setKlaarGemeld}
          onAccepteren={(id, opties) => setGeaccepteerd(id, { ...opties, door: wie })}
        />
      )}
    </div>
  );
}
