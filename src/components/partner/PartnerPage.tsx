'use client';

import { useEffect, useState } from 'react';
import { useAfterSales } from '@/hooks/useAfterSales';
import { useAuth } from '@/hooks/useAuth';
import type { AfterSalesAuto } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import PartnerModal from './PartnerModal';
import styles from './PartnerPage.module.css';

const TYPE_LABEL: Record<string, string> = { import: 'Import', nl: 'NL', nieuw: 'Nieuw', voorraad: 'Voorraad' };
const TYPE_CSS:   Record<string, string> = { import: styles.typeImport, nl: styles.typeNl, nieuw: styles.typeNieuw, voorraad: styles.typeVoorraad };

function datumFmt(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
}

export default function PartnerPage({ wie }: { wie: string }) {
  const { autos, updateAuto } = useAfterSales();
  const { signOut } = useAuth();
  const [modalAuto, setModalAuto] = useState<AfterSalesAuto | null>(null);

  // Forceer desktop-breedte op mobiel — telefoon scaled automatisch down,
  // pinch-zoom werkt voor detail. Gebruiker wilde "uitgezoomd desktop view".
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const orig = meta.getAttribute('content') ?? '';
    meta.setAttribute('content', 'width=1100, initial-scale=1, maximum-scale=5, user-scalable=yes');
    return () => { meta.setAttribute('content', orig); };
  }, []);

  const wieUpper = wie.toUpperCase();
  const mijnAutos = autos
    .filter((r) => {
      if (r.gearchiveerd || !r.binnen) return false;
      const inToegewezen = (r.partners_toegewezen ?? []).some((p) => p.toUpperCase() === wieUpper);
      const inWieRijklaar = r.wie_rijklaar?.toUpperCase() === wieUpper;
      if (!inToegewezen && !inWieRijklaar) return false;
      // Verdwijn als deze partner klaar heeft gemeld
      const isKlaar = (r.partners_klaar ?? []).some((p) => p.toUpperCase() === wieUpper);
      return !isKlaar;
    })
    .sort((a, b) => {
      // 1. Auto's die fysiek bij partner staan eerst
      if (!!a.partner_binnen !== !!b.partner_binnen) return a.partner_binnen ? -1 : 1;
      // 2. Daarna op binnen_op (oudste eerst)
      return (a.binnen_op ?? '') < (b.binnen_op ?? '') ? -1 : 1;
    });

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

      {/* Tabel */}
      <div className={styles.content}>
        {mijnAutos.length === 0 ? (
          <div className={styles.leeg}>Geen auto's toegewezen aan {wie}</div>
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
    </div>
  );
}
