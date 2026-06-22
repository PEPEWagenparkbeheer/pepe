'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WerkDerdenRecord, WerkDerdenStatus, WerkRegel } from '@/types';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import { medewerkerNaam } from '@/lib/naam';
import { isPepeOpdracht } from '@/lib/werk-derden/richting';
import styles from './PartnerModal.module.css';

interface Props {
  record: WerkDerdenRecord;
  bijlageUrl: (path: string) => Promise<string | null>;
  onSluiten: () => void;
  onKlaarMelden: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /** PEPE-zijde: opent het bewerkvenster voor dit record. */
  onBewerken?: () => void;
  /** Aanwezig in het partnerportaal: partner accepteert een PEPE-opdracht. */
  onAccepteren?: (
    id: string,
    opties?: { regels?: WerkRegel[]; voorwaarden?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

function euro(n: number): string {
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}

const STATUS_LABEL: Record<WerkDerdenStatus, string> = {
  open: '⏳ Openstaand',
  goedgekeurd: '✓ Goedgekeurd',
  klaar_gemeld: '✓ Klaar gemeld',
  gefactureerd: '✓ Gefactureerd',
  afgekeurd: '✕ Afgekeurd',
  afgerond: '✓ Afgerond',
};

function statusKleur(status: WerkDerdenStatus): React.CSSProperties {
  switch (status) {
    case 'gefactureerd': return { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    case 'afgekeurd': return { background: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    case 'goedgekeurd':
    case 'klaar_gemeld':
    case 'afgerond': return { background: 'rgba(82,196,126,0.15)', color: 'var(--green, #52c47e)' };
    default: return { background: 'rgba(234,179,8,0.15)', color: '#b45309' };
  }
}

export default function WerkDerdenDetailModal({ record, bijlageUrl, onSluiten, onKlaarMelden, onBewerken, onAccepteren }: Props) {
  const [bijlageSignedUrl, setBijlageSignedUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [aanpasModus, setAanpasModus] = useState(false);
  const [aangepasteRegels, setAangepasteRegels] = useState<WerkRegel[]>(() =>
    (record.regels?.length ? record.regels : [{ omschrijving: '', bedrag: 0 }]).map((r) => ({ ...r })),
  );
  const [voorwaardenInput, setVoorwaardenInput] = useState('');

  // Te accepteren = een door PEPE klaargezette opdracht die nog open staat.
  const teAccepteren = !!onAccepteren && record.status === 'open' && isPepeOpdracht(record);
  const origineelBedrag = record.inkoop_bedrag ?? (record.regels ?? []).reduce((s, r) => s + (r.bedrag ?? 0), 0);
  const nieuwBedrag = aangepasteRegels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0);
  const verschil = nieuwBedrag - origineelBedrag;

  async function accepteer(opties?: { regels?: WerkRegel[]; voorwaarden?: string }) {
    if (!onAccepteren) return;
    setBezig(true);
    await onAccepteren(record.id, opties);
    setBezig(false);
    onSluiten();
  }

  useEffect(() => {
    let actief = true;
    if (record.bijlage_storage_path) {
      bijlageUrl(record.bijlage_storage_path).then((url) => { if (actief) setBijlageSignedUrl(url); });
    }
    return () => { actief = false; };
  }, [record.bijlage_storage_path, bijlageUrl]);

  const voertuig = record.kenteken ?? record.meldcode ?? '—';

  return createPortal(
    <div className={styles.overlay} onClick={onSluiten}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            <KentekenPlaat kenteken={voertuig} />
            <div className={styles.modalAuto}>
              <span className={styles.merk}>{record.merk || 'Kostenmelding'}</span>{' '}
              <span className={styles.model}>{record.model}</span>
              {record.klant && <span className={styles.klant}>{record.klant}</span>}
            </div>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Status */}
          <section className={styles.sectie}>
            <h3 className={styles.sectieLabel}>Status</h3>
            <div>
              <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, ...statusKleur(record.status) }}>
                {STATUS_LABEL[record.status] ?? record.status}
              </span>
              {isPepeOpdracht(record) && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Klaargezet door PEPE{record.toegevoegd_door && record.toegevoegd_door.toUpperCase() !== 'PEPE' ? ` — ${medewerkerNaam(record.toegevoegd_door)}` : ''}
                </div>
              )}
              {record.status === 'afgekeurd' && record.afkeur_reden && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{record.afkeur_reden}</div>
              )}
              {(record.goedgekeurd_door || record.goedgekeurd_op) && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Goedgekeurd{record.goedgekeurd_door ? ` door ${medewerkerNaam(record.goedgekeurd_door)}` : ''}
                  {record.goedgekeurd_op ? ` op ${new Date(record.goedgekeurd_op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              )}
              {(record.afgekeurd_door || record.afgekeurd_op) && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Afgekeurd{record.afgekeurd_door ? ` door ${medewerkerNaam(record.afgekeurd_door)}` : ''}
                  {record.afgekeurd_op ? ` op ${new Date(record.afgekeurd_op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              )}
              {(record.afgerond_door || record.afgerond_op) && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Afgerond{record.afgerond_door ? ` door ${medewerkerNaam(record.afgerond_door)}` : ''}
                  {record.afgerond_op ? ` op ${new Date(record.afgerond_op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              )}
            </div>
          </section>

          {/* Kostenregels */}
          {record.regels.length > 0 && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Kostenregels</h3>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {record.regels.map((regel, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span>{regel.omschrijving}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{regel.bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                ))}
                {record.inkoop_bedrag != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', fontSize: 14, fontWeight: 700 }}>
                    <span>Totaal excl. BTW</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{record.inkoop_bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Toelichting */}
          {record.notitie && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Toelichting</h3>
              <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{record.notitie}</div>
            </section>
          )}

          {/* Voorwaarden (goedgekeurd met aanpassingen) */}
          {record.voorwaarden && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Goedgekeurd met voorwaarden</h3>
              <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '10px 14px' }}>
                {record.voorwaarden}
              </div>
            </section>
          )}

          {/* Bijlage */}
          {record.bijlage_storage_path && (
            <section className={styles.sectie}>
              <h3 className={styles.sectieLabel}>Bijlage</h3>
              {bijlageSignedUrl
                ? <a href={bijlageSignedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'underline' }}>📎 Bijlage openen</a>
                : <span style={{ fontSize: 14, color: 'var(--muted)' }}>Laden…</span>}
            </section>
          )}
        </div>

        {/* Footer — accepteren bij open PEPE-opdracht */}
        {teAccepteren && !aanpasModus && (
          <div className={styles.modalFooter} style={{ gap: 10 }}>
            <button
              className={styles.klaarKnop}
              disabled={bezig}
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={() => setAanpasModus(true)}
            >
              ✎ Bedrag aanpassen
            </button>
            <button
              className={styles.klaarKnop}
              disabled={bezig}
              onClick={() => accepteer()}
            >
              {bezig ? 'Bezig…' : '✓ Accepteren'}
            </button>
          </div>
        )}

        {teAccepteren && aanpasModus && (
          <div className={styles.modalFooter} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aangepasteRegels.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{r.omschrijving || 'Regel'}</span>
                  <span style={{ fontSize: 13 }}>€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.bedrag || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setAangepasteRegels((prev) => prev.map((x, i) => (i === idx ? { ...x, bedrag: v } : x)));
                    }}
                    style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'right' }}
                  />
                </div>
              ))}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600,
              padding: '8px 12px', borderRadius: 8,
              background: Math.abs(verschil) > 0.005 ? 'rgba(234,88,12,0.10)' : 'var(--bg)',
              border: Math.abs(verschil) > 0.005 ? '1px solid #fdba74' : '1px solid var(--border)',
              color: Math.abs(verschil) > 0.005 ? '#9a3412' : 'var(--text)',
            }}>
              PEPE: {euro(origineelBedrag)} → Nu: {euro(nieuwBedrag)}
              {Math.abs(verschil) > 0.005 && ` (${verschil > 0 ? '+' : '−'}${euro(Math.abs(verschil))})`}
            </div>
            <textarea
              rows={2}
              value={voorwaardenInput}
              onChange={(e) => setVoorwaardenInput(e.target.value)}
              placeholder="Toelichting / voorwaarde (optioneel)…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className={styles.klaarKnop}
                disabled={bezig}
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                onClick={() => setAanpasModus(false)}
              >
                Annuleren
              </button>
              <button
                className={styles.klaarKnop}
                disabled={bezig}
                onClick={() => accepteer({ regels: aangepasteRegels, voorwaarden: voorwaardenInput })}
              >
                {bezig ? 'Bezig…' : '✓ Accepteren met aangepast bedrag'}
              </button>
            </div>
          </div>
        )}

        {/* Footer — klaar melden bij goedgekeurd */}
        {record.status === 'goedgekeurd' && (
          <div className={styles.modalFooter}>
            <button
              className={styles.klaarKnop}
              disabled={bezig}
              onClick={async () => {
                setBezig(true);
                await onKlaarMelden(record.id);
                setBezig(false);
                onSluiten();
              }}
            >
              {bezig ? 'Bezig…' : '✓ Klaar melden'}
            </button>
          </div>
        )}
        {/* Footer — bewerken voor PEPE-kant (open records) */}
        {onBewerken && record.status === 'open' && (
          <div className={styles.modalFooter}>
            <button className={styles.sluitenKnopFooter ?? styles.klaarKnop} style={{ background: '#555' }} onClick={onBewerken}>
              ✏️ Bewerken
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
