'use client';

import { useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import { useWerkDerden } from '@/hooks/useWerkDerden';
import { useAuth } from '@/hooks/useAuth';
import type { AfterSalesAuto } from '@/types';
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
  const { records: wdRecords, actieCount: wdOpenCount, addRecord: wdAddRecord } = useWerkDerden(wie);
  const [wdModalOpen, setWdModalOpen] = useState(false);
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
          Mijn meldingen
          {wdOpenCount > 0 && <span className={styles.tabBadge}>{wdOpenCount}</span>}
        </button>
      </div>

      {/* Tabel */}
      <div className={styles.content}>
        {mijnAutos.length === 0 ? (
          <div className={styles.leeg}>
            {tab === 'actief'
              ? `Geen openstaande auto's voor `
              : tab === 'klaar' ? `Nog geen klaar gemelde auto's voor ` : 'Nog geen meldingen.'}
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
                  {wdRecords.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.kenteken}</strong>{r.klant ? ' · ' + r.klant : ''}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                      </td>
                      <td className={styles.mobielVerbergen}>
                        {r.inkoop_bedrag != null ? r.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : '—'}
                      </td>
                      <td>
                        <span className={r.status === 'gefactureerd' ? styles.stGefactureerd : r.status === 'afgekeurd' ? styles.stAfgekeurd : styles.stOpen}>
                          {r.status === 'gefactureerd' ? '✓ Gefactureerd' : r.status === 'afgekeurd' ? '✕ Afgekeurd' : '⏳ Open'}
                        </span>
                        {r.status === 'afgekeurd' && r.afkeur_reden && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.afkeur_reden}</div>
                        )}
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}



