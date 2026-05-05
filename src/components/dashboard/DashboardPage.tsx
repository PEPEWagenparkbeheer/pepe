'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './DashboardPage.module.css';

interface DashData {
  prio: number;
  akkoordMnd: number;
  prioRijen: { id: number; klant: string; auto: string; wiezoekt?: string }[];
  rijklaarRijen: { id: string; kenteken: string; merk?: string; model?: string; klant?: string; afleverdatum?: string }[];
  btwRijen: { id: string; auto: string; klant?: string; ingekocht_op?: string }[];
  leaseRijen: { id: string; klant_naam: string; merk?: string; model?: string; leasemaatschappij?: string }[];
}

function groet() {
  const h = new Date().getHours();
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function datumTekst() {
  return new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dagenGeleden(datum?: string): number {
  if (!datum) return 0;
  const ms = Date.now() - new Date(datum).getTime();
  return Math.floor(ms / 86_400_000);
}

const LEEG: DashData = {
  prio: 0, akkoordMnd: 0,
  prioRijen: [], rijklaarRijen: [], btwRijen: [], leaseRijen: [],
};

export default function DashboardPage() {
  const [data, setData] = useState<DashData>(LEEG);
  const [laden, setLaden] = useState(true);
  const [naam, setNaam] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        const voornaam = user.email.split('@')[0];
        setNaam(voornaam.charAt(0).toUpperCase() + voornaam.slice(1));
      }
    });

    laadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function laadData() {
    setLaden(true);
    const veertienDagenGeleden = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

    const [zoekRes, asRes, btwRes, leaseRes] = await Promise.all([
      supabase.from('zoekopdrachten').select('id,klant,auto,wiezoekt,prio,uitgesteld,akkoord,akkoord_datum'),
      supabase.from('after_sales').select('id,kenteken,merk,model,klant,afleverdatum,binnen,klaar,gearchiveerd'),
      supabase.from('btw_records').select('id,auto,klant,ingekocht_op,geld_van_lm,geld_van_dealer,gearchiveerd'),
      supabase.from('lease_aanvragen').select('id,klant_naam,merk,model,leasemaatschappij,verkocht,akkoord,offerte_verstuurd'),
    ]);

    const zoek = zoekRes.data ?? [];
    const as = asRes.data ?? [];
    const btw = btwRes.data ?? [];
    const lease = leaseRes.data ?? [];

    const nu = new Date();
    const prio = zoek.filter(z => z.prio && !z.akkoord && !z.uitgesteld).length;
    const akkoordMnd = zoek.filter(z => {
      if (!z.akkoord || !z.akkoord_datum) return false;
      const d = new Date(z.akkoord_datum);
      return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
    }).length;

    const prioRijen = zoek
      .filter(z => z.prio && !z.akkoord && !z.uitgesteld)
      .slice(0, 6)
      .map(z => ({ id: z.id, klant: z.klant, auto: z.auto, wiezoekt: z.wiezoekt }));

    const rijklaarRijen = as
      .filter(a => a.binnen && !a.klaar && !a.gearchiveerd)
      .slice(0, 6)
      .map(a => ({ id: a.id, kenteken: a.kenteken, merk: a.merk, model: a.model, klant: a.klant, afleverdatum: a.afleverdatum }));

    const btwRijen = btw
      .filter(b => !b.gearchiveerd && !b.geld_van_lm && !b.geld_van_dealer && b.ingekocht_op && b.ingekocht_op <= veertienDagenGeleden)
      .slice(0, 6)
      .map(b => ({ id: b.id, auto: b.auto, klant: b.klant, ingekocht_op: b.ingekocht_op }));

    const leaseRijen = lease
      .filter(l => !l.verkocht && l.offerte_verstuurd && !l.akkoord)
      .slice(0, 6)
      .map(l => ({ id: l.id, klant_naam: l.klant_naam, merk: l.merk, model: l.model, leasemaatschappij: l.leasemaatschappij }));

    setData({ prio, akkoordMnd, prioRijen, rijklaarRijen, btwRijen, leaseRijen });
    setLaden(false);
  }

  if (laden) return <div className={styles.laden}>Laden…</div>;

  return (
    <div className={styles.pagina}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <div className={styles.greetingTekst}>
          {groet()}{naam ? <>, <span>{naam}</span></> : null} 👋
        </div>
        <div className={styles.datumChip}>{datumTekst()}</div>
      </div>

      {/* KPI strip */}
      <div className={styles.kpiStrip}>
        <div className={`${styles.kpiCard} ${data.prio > 0 ? styles.hot : ''}`}>
          <div className={styles.kpiIcoon}>🚩</div>
          <div className={`${styles.kpiGetal} ${data.prio > 0 ? styles.warn : ''}`}>{data.prio}</div>
          <div className={styles.kpiLabel}>Prio opdrachten</div>
        </div>
        <div className={`${styles.kpiCard} ${data.rijklaarRijen.length > 0 ? styles.warn : ''}`}>
          <div className={styles.kpiIcoon}>📦</div>
          <div className={styles.kpiGetal}>{data.rijklaarRijen.length}</div>
          <div className={styles.kpiLabel}>Auto rijklaar</div>
        </div>
        <div className={`${styles.kpiCard} ${data.btwRijen.length > 0 ? styles.hot : ''}`}>
          <div className={styles.kpiIcoon}>💶</div>
          <div className={`${styles.kpiGetal} ${data.btwRijen.length > 0 ? styles.warn : ''}`}>{data.btwRijen.length}</div>
          <div className={styles.kpiLabel}>BTW &gt; 14 dagen</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcoon}>✅</div>
          <div className={styles.kpiGetal}>{data.akkoordMnd}</div>
          <div className={styles.kpiLabel}>Akkoord deze maand</div>
        </div>
      </div>

      {/* 2×2 Kaarten */}
      <div className={styles.kaartenGrid}>
        {/* Prio zoekopdrachten */}
        <div className={styles.kaart}>
          <div className={styles.kaartHeader}>
            <span>🚩</span>
            <div className={styles.kaartTitel}>Prio zoekopdrachten</div>
            <div className={`${styles.kaartCount} ${data.prioRijen.length > 0 ? styles.hot : ''}`}>{data.prio}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.prioRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen prio zoekopdrachten</div>
            ) : data.prioRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <span className={styles.prioVlag}>🚩</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.klant}</div>
                  <div className={styles.rijSub}>{r.auto}</div>
                </div>
                {r.wiezoekt && <div className={styles.rijInfo}>{r.wiezoekt}</div>}
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/zoeken" className={styles.bekijkLink}>Bekijk alle zoekopdrachten →</Link>
          </div>
        </div>

        {/* Rijklaar maken */}
        <div className={styles.kaart}>
          <div className={styles.kaartHeader}>
            <span>📦</span>
            <div className={styles.kaartTitel}>Rijklaar maken</div>
            <div className={`${styles.kaartCount} ${data.rijklaarRijen.length > 0 ? styles.warn : ''}`}>{data.rijklaarRijen.length}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.rijklaarRijen.length === 0 ? (
              <div className={styles.leegKaart}>Alles rijklaar ✓</div>
            ) : data.rijklaarRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.kenteken} — {r.merk} {r.model}</div>
                  <div className={styles.rijSub}>{r.klant}</div>
                </div>
                {r.afleverdatum && (
                  <div className={styles.rijWarn}>
                    {new Date(r.afleverdatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/aftersales" className={styles.bekijkLink}>Bekijk After Sales →</Link>
          </div>
        </div>

        {/* BTW/Credit > 14 dagen */}
        <div className={styles.kaart}>
          <div className={styles.kaartHeader}>
            <span>💶</span>
            <div className={styles.kaartTitel}>BTW/Credit &gt; 14 dagen</div>
            <div className={`${styles.kaartCount} ${data.btwRijen.length > 0 ? styles.hot : ''}`}>{data.btwRijen.length}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.btwRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen openstaande BTW &gt; 14 dagen</div>
            ) : data.btwRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.auto}</div>
                  <div className={styles.rijSub}>{r.klant}</div>
                </div>
                <div className={styles.rijWarn}>{dagenGeleden(r.ingekocht_op)}d</div>
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/btw" className={styles.bekijkLink}>Bekijk BTW/Credit →</Link>
          </div>
        </div>

        {/* Lease — wacht op beslissing */}
        <div className={styles.kaart}>
          <div className={styles.kaartHeader}>
            <span>📋</span>
            <div className={styles.kaartTitel}>Lease — wacht op beslissing</div>
            <div className={`${styles.kaartCount} ${data.leaseRijen.length > 0 ? styles.warn : ''}`}>{data.leaseRijen.length}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.leaseRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen openstaande offertes</div>
            ) : data.leaseRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.klant_naam}</div>
                  <div className={styles.rijSub}>{r.merk} {r.model}</div>
                </div>
                {r.leasemaatschappij && <div className={styles.rijInfo}>{r.leasemaatschappij}</div>}
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/lease" className={styles.bekijkLink}>Bekijk Lease →</Link>
          </div>
        </div>
      </div>

      {/* Sync indicator */}
      <div className={styles.syncBalk}>
        <div className={styles.syncDot} />
        <div className={styles.syncTekst}>Live data — {new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
}
