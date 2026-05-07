'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './DashboardPage.module.css';

interface DashData {
  prio: number;
  akkoordMnd: number;
  nieuwLeads: number;
  tePlannen: number;
  geplandCount: number;
  prioRijen:      { id: number; klant: string; auto: string; wiezoekt?: string }[];
  rijklaarRijen:  { id: string; kenteken: string; merk?: string; model?: string; klant?: string; afleverdatum?: string }[];
  btwRijen:       { id: string; auto: string; klant?: string; ingekocht_op?: string; bedrag?: number }[];
  leaseRijen:     { id: string; klant_naam: string; merk?: string; model?: string; leasemaatschappij?: string }[];
  leadsRijen:     { id: string; klant_naam: string; auto: string; status: string; bron: string; wie?: string }[];
  geplandRijen:   { id: string; kenteken: string; merk?: string; model?: string; klant?: string; afleverdatum: string }[];
  tePlannenRijen: { id: string; kenteken: string; merk?: string; model?: string; klant?: string; type?: string }[];
}

const LEEG: DashData = {
  prio: 0, akkoordMnd: 0, nieuwLeads: 0, tePlannen: 0, geplandCount: 0,
  prioRijen: [], rijklaarRijen: [], btwRijen: [], leaseRijen: [],
  leadsRijen: [], geplandRijen: [], tePlannenRijen: [],
};

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
  return Math.floor((Date.now() - new Date(datum).getTime()) / 86_400_000);
}

function bedragFmt(b?: number) {
  if (b == null) return null;
  return '€ ' + b.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

const BRON_LABEL: Record<string, string> = {
  autoscout24: 'AS24', autowereld: 'AW', marktplaats: 'MP', email: 'Mail', anders: '—',
};
const STATUS_LABEL: Record<string, string> = {
  nieuw: 'Nieuw', opgepakt: 'Opgepakt', gebeld: 'Gebeld', interesse: 'Interesse', verkocht: 'Verkocht',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashData>(LEEG);
  const [laden, setLaden] = useState(true);
  const [naam, setNaam] = useState('');

  const ref0 = useRef<HTMLDivElement>(null);
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  const ref3 = useRef<HTMLDivElement>(null);
  const ref4 = useRef<HTMLDivElement>(null);
  const ref5 = useRef<HTMLDivElement>(null);
  const kaartRefs = [ref0, ref1, ref2, ref3, ref4, ref5];

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        const v = user.email.split('@')[0];
        setNaam(v.charAt(0).toUpperCase() + v.slice(1));
      }
    });
    laadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function laadData() {
    setLaden(true);
    const veertienDagenGeleden = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

    const [zoekRes, asRes, btwRes, leaseRes, leadsRes] = await Promise.all([
      supabase.from('zoekopdrachten').select('id,klant,auto,wiezoekt,prio,uitgesteld,akkoord,akkoord_datum'),
      supabase.from('after_sales').select('id,kenteken,merk,model,klant,afleverdatum,binnen,klaar,gearchiveerd,type,bin_ontvangen,binnen_op'),
      supabase.from('btw_records').select('id,auto,klant,ingekocht_op,geld_van_lm,geld_van_dealer,gearchiveerd,bedrag'),
      supabase.from('lease_aanvragen').select('id,klant_naam,merk,model,leasemaatschappij,verkocht,akkoord,offerte_verstuurd'),
      supabase.from('leads').select('id,klant_naam,auto,status,bron,wie,gearchiveerd,created_at'),
    ]);

    const zoek  = zoekRes.data  ?? [];
    const as    = asRes.data    ?? [];
    const btw   = btwRes.data   ?? [];
    const lease = leaseRes.data ?? [];
    const leads = leadsRes.data ?? [];

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

    const geplandAll = as
      .filter(a => a.afleverdatum && !a.gearchiveerd)
      .sort((a, b) => a.afleverdatum < b.afleverdatum ? -1 : 1);
    const geplandRijen = geplandAll.slice(0, 6)
      .map(a => ({ id: a.id, kenteken: a.kenteken, merk: a.merk, model: a.model, klant: a.klant, afleverdatum: a.afleverdatum }));

    const tePlannenAll = as
      .filter(a => !a.gearchiveerd && !a.afleverdatum && (a.klaar || (a.type === 'import' && a.bin_ontvangen)))
      .sort((a, b) => (a.binnen_op ?? '') < (b.binnen_op ?? '') ? -1 : 1);
    const tePlannenRijen = tePlannenAll.slice(0, 6)
      .map(a => ({ id: a.id, kenteken: a.kenteken, merk: a.merk, model: a.model, klant: a.klant, type: a.type }));

    const btwRijen = btw
      .filter(b => !b.gearchiveerd && !b.geld_van_lm && !b.geld_van_dealer && b.ingekocht_op && b.ingekocht_op <= veertienDagenGeleden)
      .slice(0, 6)
      .map(b => ({ id: b.id, auto: b.auto, klant: b.klant, ingekocht_op: b.ingekocht_op, bedrag: b.bedrag ?? undefined }));

    const leaseRijen = lease
      .filter(l => !l.verkocht && l.offerte_verstuurd && !l.akkoord)
      .slice(0, 6)
      .map(l => ({ id: l.id, klant_naam: l.klant_naam, merk: l.merk, model: l.model, leasemaatschappij: l.leasemaatschappij }));

    const actieveLeads = leads.filter(l => !l.gearchiveerd && l.status !== 'geen_interesse');
    const leadsRijen = actieveLeads
      .sort((a, b) => a.created_at > b.created_at ? -1 : 1)
      .slice(0, 6)
      .map(l => ({ id: l.id, klant_naam: l.klant_naam, auto: l.auto, status: l.status, bron: l.bron, wie: l.wie }));

    const nieuwLeads = leads.filter(l => !l.gearchiveerd && l.status === 'nieuw').length;

    setData({
      prio, akkoordMnd, nieuwLeads,
      tePlannen: tePlannenAll.length,
      geplandCount: geplandAll.length,
      prioRijen, rijklaarRijen, btwRijen, leaseRijen,
      leadsRijen, geplandRijen, tePlannenRijen,
    });
    setLaden(false);
  }

  if (laden) return <div className={styles.laden}>Laden…</div>;

  const kpiTiles = [
    { icoon: '🚩', getal: data.prio,         label: 'Prio opdrachten',       kleur: data.prio > 0 ? 'hot' : '' },
    { icoon: '📞', getal: data.nieuwLeads,    label: 'Nieuwe leads',          kleur: data.nieuwLeads > 0 ? 'hot' : '' },
    { icoon: '🚗', getal: data.tePlannen,     label: 'Te plannen',            kleur: data.tePlannen > 0 ? 'warn' : '' },
    { icoon: '📅', getal: data.geplandCount,  label: 'Geplande afleveringen', kleur: data.geplandCount > 0 ? 'good' : '' },
    { icoon: '💶', getal: data.btwRijen.length, label: 'BTW > 14 dagen',     kleur: data.btwRijen.length > 0 ? 'hot' : '' },
    { icoon: '✅', getal: data.akkoordMnd,    label: 'Akkoord deze maand',    kleur: '' },
  ];

  return (
    <div className={styles.pagina}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <div className={styles.greetingTekst}>
          {groet()}{naam ? <>, <span>{naam}</span></> : null} 👋
        </div>
        <div className={styles.datumChip}>{datumTekst()}</div>
      </div>

      {/* KPI strip — klikbaar, scrolt naar kaart */}
      <div className={styles.kpiStrip}>
        {kpiTiles.map((t, i) => (
          <div
            key={t.label}
            className={`${styles.kpiCard} ${t.kleur ? styles[t.kleur as 'hot' | 'warn' | 'good'] : ''}`}
            onClick={() => kaartRefs[i].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <div className={styles.kpiIcoon}>{t.icoon}</div>
            <div className={`${styles.kpiGetal} ${t.kleur === 'warn' ? styles.warn : t.kleur === 'good' ? styles.ok : ''}`}>
              {t.getal}
            </div>
            <div className={styles.kpiLabel}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* 3×2 Kaarten */}
      <div className={styles.kaartenGrid}>

        {/* 1. Prio zoekopdrachten */}
        <div className={styles.kaart} ref={ref0}>
          <div className={styles.kaartHeader}>
            <span>🚩</span>
            <div className={styles.kaartTitel}>Prio zoekopdrachten</div>
            <div className={`${styles.kaartCount} ${data.prio > 0 ? styles.hot : ''}`}>{data.prio}</div>
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

        {/* 2. Openstaande leads */}
        <div className={styles.kaart} ref={ref1}>
          <div className={styles.kaartHeader}>
            <span>📞</span>
            <div className={styles.kaartTitel}>Openstaande leads</div>
            <div className={`${styles.kaartCount} ${data.leadsRijen.length > 0 ? styles.hot : ''}`}>{data.leadsRijen.length}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.leadsRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen openstaande leads</div>
            ) : data.leadsRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div className={styles.bronChip}>{BRON_LABEL[r.bron] ?? r.bron}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.klant_naam}</div>
                  <div className={styles.rijSub}>{r.auto}</div>
                </div>
                {r.wie
                  ? <div className={styles.rijInfo}>{r.wie}</div>
                  : <div className={styles.rijLeadLeeg}>Onbeh.</div>
                }
                <div className={`${styles.statusChip} ${styles['st_' + r.status]}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/leads" className={styles.bekijkLink}>Bekijk alle leads →</Link>
          </div>
        </div>

        {/* 3. Geplande afleveringen */}
        <div className={styles.kaart} ref={ref2}>
          <div className={styles.kaartHeader}>
            <span>📅</span>
            <div className={styles.kaartTitel}>Geplande afleveringen</div>
            <div className={`${styles.kaartCount} ${data.geplandCount > 0 ? styles.ok : ''}`}>{data.geplandCount}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.geplandRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen geplande afleveringen</div>
            ) : data.geplandRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.kenteken} — {r.merk} {r.model}</div>
                  <div className={styles.rijSub}>{r.klant}</div>
                </div>
                <div className={styles.rijDatum}>
                  {new Date(r.afleverdatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/aftersales" className={styles.bekijkLink}>Bekijk After Sales →</Link>
          </div>
        </div>

        {/* 4. Te plannen afleveringen */}
        <div className={styles.kaart} ref={ref3}>
          <div className={styles.kaartHeader}>
            <span>🚗</span>
            <div className={styles.kaartTitel}>Te plannen afleveringen</div>
            <div className={`${styles.kaartCount} ${data.tePlannen > 0 ? styles.warn : ''}`}>{data.tePlannen}</div>
          </div>
          <div className={styles.kaartBody}>
            {data.tePlannenRijen.length === 0 ? (
              <div className={styles.leegKaart}>Geen auto's klaar om te plannen</div>
            ) : data.tePlannenRijen.map(r => (
              <div key={r.id} className={styles.rij}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.rijHoofd}>{r.kenteken} — {r.merk} {r.model}</div>
                  <div className={styles.rijSub}>{r.klant}</div>
                </div>
                {r.type === 'import' && <div className={styles.rijInfo}>Import</div>}
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/aftersales" className={styles.bekijkLink}>Aflevering plannen →</Link>
          </div>
        </div>

        {/* 5. BTW/Credit > 14 dagen */}
        <div className={styles.kaart} ref={ref4}>
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
                {r.bedrag != null && (
                  <div className={styles.rijBedrag}>{bedragFmt(r.bedrag)}</div>
                )}
                <div className={styles.rijWarn}>{dagenGeleden(r.ingekocht_op)}d</div>
              </div>
            ))}
          </div>
          <div className={styles.kaartFooter}>
            <Link href="/btw" className={styles.bekijkLink}>Bekijk BTW/Credit →</Link>
          </div>
        </div>

        {/* 6. Lease — wacht op beslissing */}
        <div className={styles.kaart} ref={ref5}>
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
