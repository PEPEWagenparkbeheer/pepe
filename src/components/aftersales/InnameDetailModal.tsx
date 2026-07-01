'use client';

import type { InnameFormulier } from '@/types';
import styles from './AfterSalesPage.module.css';

const VB_W = 900;
const VB_H = 630;

const ITEM_LABELS: Record<string, string> = {
  reset: 'Reset', laadkabels: 'Laadkabels', sleutels: 'Sleutels',
  trekhaak: 'Trekhaak', matten: 'Matten', alarm: 'Alarm',
};

const TANK_LABELS: Record<string, string> = {
  leeg: 'Leeg', kwart: '¼', half: '½', driekwart: '¾', vol: 'Vol',
};

interface Props {
  inname: InnameFormulier;
  onSluiten: () => void;
}

export default function InnameDetailModal({ inname, onSluiten }: Props) {
  const items = inname.items ?? {};
  const aangevinkt = Object.entries(items).filter(([, v]) => v).map(([k]) => ITEM_LABELS[k] ?? k);
  const punten = inname.schade_diagram ?? [];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: 560 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            📋 Innameformulier — {inname.kenteken || inname.meldcode || '—'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>

          {/* Basisinfo */}
          <div className={styles.sectieHdr}>Algemeen</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
            {inname.datum        && <span>📅 <b>Datum:</b> {inname.datum}</span>}
            {inname.inname_door  && <span>👤 <b>Door:</b> {inname.inname_door}</span>}
            {inname.merk_type    && <span>🚗 <b>Auto:</b> {inname.merk_type}</span>}
            {inname.brandstof    && <span>⛽ <b>Brandstof:</b> {inname.brandstof}</span>}
            {inname.meldcode     && <span>🔖 <b>Meldcode:</b> {inname.meldcode}</span>}
            {inname.kenteken     && <span>🔑 <b>Kenteken:</b> {inname.kenteken}</span>}
          </div>

          {/* KM / APK */}
          <div className={styles.sectieHdr} style={{ marginTop: 14 }}>Kilometer / APK</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
            {inname.km_stand           && <span>📏 <b>Km-stand:</b> {inname.km_stand.toLocaleString('nl-NL')} km</span>}
            {inname.apk_geldig_tot     && <span>🔧 <b>APK:</b> {inname.apk_geldig_tot}</span>}
            {inname.laatste_beurt_datum && <span>🗓 <b>Laatste beurt:</b> {inname.laatste_beurt_datum}</span>}
            {inname.laatste_beurt_km   && <span>📏 <b>Beurt km:</b> {inname.laatste_beurt_km.toLocaleString('nl-NL')} km</span>}
          </div>

          {/* Tank + Banden */}
          <div className={styles.sectieHdr} style={{ marginTop: 14 }}>Tank / Banden</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
            {inname.tankinhoud  && <span>⛽ <b>Tank:</b> {TANK_LABELS[inname.tankinhoud] ?? inname.tankinhoud}</span>}
            {inname.band_seizoen && <span>🔄 <b>Seizoen:</b> {inname.band_seizoen}</span>}
            {inname.bandenmaat  && <span>📐 <b>Maat:</b> {inname.bandenmaat}</span>}
            {(inname.band_lv || inname.band_rv) && (
              <span>LV/RV: {inname.band_lv ?? '–'} / {inname.band_rv ?? '–'} mm</span>
            )}
            {(inname.band_la || inname.band_ra) && (
              <span>LA/RA: {inname.band_la ?? '–'} / {inname.band_ra ?? '–'} mm</span>
            )}
          </div>

          {/* Items */}
          {aangevinkt.length > 0 && (
            <>
              <div className={styles.sectieHdr} style={{ marginTop: 14 }}>Aanwezig</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                {aangevinkt.join(' · ')}
              </div>
            </>
          )}

          {/* Schade diagram */}
          <div className={styles.sectieHdr} style={{ marginTop: 14 }}>Schadediagram</div>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#fff', display: 'block' }}
          >
            <image href="/car-diagram.png" x="0" y="0" width={VB_W} height={VB_H} preserveAspectRatio="xMidYMid meet" />
            {punten.map((p, i) => (
              <g key={i}>
                <circle cx={p.x * VB_W} cy={p.y * VB_H} r="14" fill="rgba(220,38,38,0.85)" />
                <text
                  x={p.x * VB_W} y={p.y * VB_H + 5}
                  textAnchor="middle" fontSize="11" fontWeight="700" fill="white"
                >
                  {p.symbol}
                </text>
              </g>
            ))}
          </svg>
          {punten.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Geen schade gemarkeerd</p>
          )}

          {/* Omschrijving */}
          {inname.schade_omschrijving && (
            <>
              <div className={styles.sectieHdr} style={{ marginTop: 14 }}>Omschrijving</div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                {inname.schade_omschrijving}
              </p>
            </>
          )}

        </div>

        <div className={styles.modalFooter}>
          <button className="btn btn-a" onClick={onSluiten}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
