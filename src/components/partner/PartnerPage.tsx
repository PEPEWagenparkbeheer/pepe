'use client';

import { useState } from 'react';
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

  const mijnAutos = autos
    .filter((r) => !r.gearchiveerd && r.binnen && r.wie_rijklaar?.toUpperCase() === wie.toUpperCase())
    .sort((a, b) => {
      if (!!a.wie_rijklaar_klaar !== !!b.wie_rijklaar_klaar) return a.wie_rijklaar_klaar ? 1 : -1;
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
                  <th>Klant</th>
                  <th>Type</th>
                  <th>Ingepland</th>
                  <th>Onderdelen</th>
                  <th>Updates</th>
                  <th className={styles.chk}>Klaar</th>
                </tr>
              </thead>
              <tbody>
                {mijnAutos.map((r) => {
                  const updates = r.partner_updates ?? [];
                  const klaar = !!r.wie_rijklaar_klaar;
                  return (
                    <tr
                      key={r.id}
                      className={klaar ? styles.rijKlaar : ''}
                      onClick={() => setModalAuto(r)}
                    >
                      <td><KentekenPlaat kenteken={r.kenteken} /></td>
                      <td>
                        <span className={styles.merk}>{r.merk}</span>{' '}
                        <span className={styles.model}>{r.model}</span>
                      </td>
                      <td>{r.klant || '—'}</td>
                      <td>
                        {r.type
                          ? <span className={`${styles.badge} ${TYPE_CSS[r.type] ?? ''}`}>{TYPE_LABEL[r.type] ?? r.type}</span>
                          : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {r.partner_datum ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{datumFmt(r.partner_datum)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>
                        {r.partner_onderdelen_besteld
                          ? <span className={styles.ondelBadge}>✓ Besteld</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        {updates.length > 0
                          ? <span className={styles.updatesBadge}>{updates.length} update{updates.length !== 1 ? 's' : ''}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td className={styles.chk} onClick={(e) => e.stopPropagation()}>
                        <div
                          className={`${styles.klaarCb} ${klaar ? styles.klaarCbAan : ''}`}
                          onClick={async () => {
                            await updateAuto({ ...r, wie_rijklaar_klaar: !klaar });
                          }}
                          title={klaar ? 'Klaar — klik om ongedaan te maken' : 'Klik als auto klaar is'}
                        >
                          {klaar && <svg width="14" height="11" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
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
