'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './DashboardPage.module.css';

interface TodoItem {
  id: string | number;
  label: string;
  sub?: string;
  extra?: string;
  href: string;
}

interface DashData {
  prio: number;
  akkoordZoek: number;
  akkoordLease: number;
  akkoordLead: number;
  nieuwLeads: number;
  tePlannen: number;
  geplandCount: number;
  prioRijen:      { id: number; klant: string; auto: string; wiezoekt?: string }[];
  rijklaarRijen:  { id: string; kenteken: string; merk?: string; model?: string; klant?: string; afleverdatum?: string }[];
  btwRijen:       { id: string; auto: string; klant?: string; ingekocht_op?: string; bedrag?: number }[];
  leaseRijen:     { id: string; klant_naam: string; merk?: string; model?: string; leasemaatschappij?: string }[];
  leadsRijen:     { id: string; klant_naam: string; auto: string; status: string; bron: string; wie?: string }[];
  geplandRijen:   { id: string; kenteken: string; merk?: string; model?: string; klant?: string; afleverdatum: string }[];
  tePlannenRijen: { id: string; kenteken: string; merk?: string; model?: string; klant?: string; type?: string; wie_levert_af?: string; binnen_op?: string }[];
  binnenLang: number;
  gemStadagen: number | null;
  todoTeBetalen:        TodoItem[];
  todoVandaagBinnen:    TodoItem[];
  todoPrioZoek:         TodoItem[];
  todoLeadsNietOpgepakt:TodoItem[];
  todoVandaagLevering:  TodoItem[];
}

const LEEG: DashData = {
  prio: 0, akkoordZoek: 0, akkoordLease: 0, akkoordLead: 0, nieuwLeads: 0, tePlannen: 0, geplandCount: 0,
  prioRijen: [], rijklaarRijen: [], btwRijen: [], leaseRijen: [],
  leadsRijen: [], geplandRijen: [], tePlannenRijen: [],
  binnenLang: 0, gemStadagen: null,
  todoTeBetalen: [], todoVandaagBinnen: [], todoPrioZoek: [],
  todoLeadsNietOpgepakt: [], todoVandaagLevering: [],
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
  const router = useRouter();
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
      supabase.from('after_sales').select('id,kenteken,merk,model,klant,afleverdatum,binnen,klaar,gearchiveerd,type,bin_ontvangen,binnen_op,wie_levert_af,transportdatum,betaald'),
      supabase.from('btw_records').select('id,auto,klant,ingekocht_op,geld_van_lm,geld_van_dealer,gearchiveerd,bedrag'),
      supabase.from('lease_aanvragen').select('id,klant_naam,merk,model,leasemaatschappij,verkocht,akkoord,offerte_verstuurd,verkocht_op'),
      supabase.from('leads').select('id,klant_naam,auto,status,bron,wie,gearchiveerd,created_at,veld_meta'),
    ]);

    const zoek  = zoekRes.data  ?? [];
    const as    = asRes.data    ?? [];
    const btw   = btwRes.data   ?? [];
    const lease = leaseRes.data ?? [];
    const leads = leadsRes.data ?? [];

    const nu = new Date();
    const dezeMaand = (datum?: string | null) => {
      if (!datum) return false;
      const d = new Date(datum);
      return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
    };

    const prio = zoek.filter(z => z.prio && !z.akkoord && !z.uitgesteld).length;
    const akkoordZoek = zoek.filter(z => z.akkoord && dezeMaand(z.akkoord_datum)).length;
    const akkoordLease = lease.filter(l => l.verkocht && dezeMaand(l.verkocht_op)).length;
    const akkoordLead = leads.filter(l => {
      if (l.status !== 'verkocht') return false;
      const meta = l.veld_meta as Record<string, { op: string }> | null;
      return dezeMaand(meta?.verkocht?.op);
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
      .map(a => ({ id: a.id, kenteken: a.kenteken, merk: a.merk, model: a.model, klant: a.klant, type: a.type, wie_levert_af: a.wie_levert_af, binnen_op: a.binnen_op }));

    const binnenLang = as.filter(a =>
      !a.gearchiveerd && a.binnen_op && dagenGeleden(a.binnen_op) > 14
    ).length;

    const actiefMetDatum = as.filter(a => !a.gearchiveerd && a.binnen_op);
    const gemStadagen = actiefMetDatum.length > 0
      ? Math.round(actiefMetDatum.reduce((som, a) => som + dagenGeleden(a.binnen_op!), 0) / actiefMetDatum.length)
      : null;

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

    // ── Vandaag ToDo ──────────────────────────────────────────────
    const vandaag    = new Date().toISOString().slice(0, 10);
    const overmorgen = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

    const dagLabel = (d: string) => {
      if (d === vandaag) return 'vandaag';
      const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      if (d === morgen) return 'morgen';
      return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    };

    const todoTeBetalen: TodoItem[] = (as as Record<string, unknown>[])
      .filter(a => !a.gearchiveerd && !a.betaald && a.transportdatum && (a.transportdatum as string) >= vandaag && (a.transportdatum as string) <= overmorgen)
      .map(a => ({
        id: a.id as string,
        label: `${a.kenteken} — ${a.merk ?? ''} ${a.model ?? ''}`.trim(),
        sub: a.klant as string | undefined,
        extra: dagLabel(a.transportdatum as string),
        href: '/aftersales?tab=import',
      }));

    const todoVandaagBinnen: TodoItem[] = (as as Record<string, unknown>[])
      .filter(a => !a.gearchiveerd && !a.binnen && a.transportdatum === vandaag)
      .map(a => ({
        id: a.id as string,
        label: `${a.kenteken} — ${a.merk ?? ''} ${a.model ?? ''}`.trim(),
        sub: a.klant as string | undefined,
        href: '/aftersales',
      }));

    const todoPrioZoek: TodoItem[] = zoek
      .filter(z => z.prio && !z.akkoord && !z.uitgesteld)
      .map(z => ({ id: z.id, label: z.klant, sub: z.auto, extra: z.wiezoekt, href: '/zoeken?filter=prio' }));

    const todoLeadsNietOpgepakt: TodoItem[] = leads
      .filter(l => !l.gearchiveerd && l.status === 'nieuw' && !l.wie)
      .map(l => ({ id: l.id, label: l.klant_naam, sub: l.auto, extra: BRON_LABEL[l.bron] ?? l.bron, href: '/leads?filter=nieuw' }));

    const todoVandaagLevering: TodoItem[] = (as as Record<string, unknown>[])
      .filter(a => !a.gearchiveerd && a.afleverdatum === vandaag)
      .map(a => ({
        id: a.id as string,
        label: `${a.kenteken} — ${a.merk ?? ''} ${a.model ?? ''}`.trim(),
        sub: a.klant as string | undefined,
        href: '/aftersales?tab=gepland',
      }));

    setData({
      prio, akkoordZoek, akkoordLease, akkoordLead, nieuwLeads,
      tePlannen: tePlannenAll.length,
      geplandCount: geplandAll.length,
      prioRijen, rijklaarRijen, btwRijen, leaseRijen,
      leadsRijen, geplandRijen, tePlannenRijen, binnenLang, gemStadagen,
      todoTeBetalen, todoVandaagBinnen, todoPrioZoek, todoLeadsNietOpgepakt, todoVandaagLevering,
    });
    setLaden(false);
  }

  if (laden) return <div className={styles.laden}>Laden…</div>;

  const gem = data.gemStadagen;
  const gemKleur = gem == null ? '' : gem > 28 ? 'hot' : gem > 21 ? 'warn' : 'good';

  const akkoordTotaal = data.akkoordZoek + data.akkoordLease + data.akkoordLead;
  const akkoordSub = `Z:${data.akkoordZoek} · L:${data.akkoordLease} · Ld:${data.akkoordLead}`;

  const kpiTiles = [
    { icoon: '🚩', getal: data.prio,              label: 'Prio opdrachten',       sub: null,         kleur: data.prio > 0 ? 'hot' : '',              href: '/zoeken?filter=prio' },
    { icoon: '📞', getal: data.nieuwLeads,         label: 'Nieuwe leads',          sub: null,         kleur: data.nieuwLeads > 0 ? 'hot' : '',         href: '/leads?filter=nieuw' },
    { icoon: '🚗', getal: data.tePlannen,          label: 'Te plannen',            sub: null,         kleur: data.tePlannen > 0 ? 'warn' : '',         href: '/aftersales?tab=rijklaar' },
    { icoon: '📅', getal: data.geplandCount,       label: 'Geplande afleveringen', sub: null,         kleur: data.geplandCount > 0 ? 'good' : '',      href: '/aftersales?tab=gepland' },
    { icoon: '💶', getal: data.btwRijen.length,    label: 'BTW > 14 dagen',        sub: null,         kleur: data.btwRijen.length > 0 ? 'hot' : '',    href: '/btw' },
    { icoon: '✅', getal: akkoordTotaal,           label: 'Akkoord deze maand',    sub: akkoordSub,   kleur: '',                                       href: '/zoeken?filter=akkoord' },
    { icoon: '📊', getal: gem ?? '—',              label: 'Gem. stadagen',         sub: null,         kleur: gemKleur,                                 href: '/aftersales' },
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
            onClick={() => router.push(t.href)}
          >
            <div className={styles.kpiIcoon}>{t.icoon}</div>
            <div className={`${styles.kpiGetal} ${t.kleur === 'warn' ? styles.warn : t.kleur === 'good' ? styles.ok : ''}`}>
              {t.getal}
            </div>
            <div className={styles.kpiLabel}>{t.label}</div>
            {t.sub && <div className={styles.kpiSub}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* Vandaag ToDo */}
      {(data.todoTeBetalen.length + data.todoVandaagBinnen.length + data.todoPrioZoek.length + data.todoLeadsNietOpgepakt.length + data.todoVandaagLevering.length) > 0 && (() => {
        const secties = [
          { icoon: '💳', label: 'Betalen', kleur: 'todoRood',  items: data.todoTeBetalen },
          { icoon: '🚛', label: 'Vandaag binnen', kleur: 'todoBlauw', items: data.todoVandaagBinnen },
          { icoon: '🚩', label: 'Prio zoekopdrachten', kleur: 'todoOranje', items: data.todoPrioZoek },
          { icoon: '📞', label: 'Leads niet opgepakt', kleur: 'todoOranje', items: data.todoLeadsNietOpgepakt },
          { icoon: '📅', label: 'Vandaag levering', kleur: 'todoGroen',  items: data.todoVandaagLevering },
        ].filter(s => s.items.length > 0);
        return (
          <div className={styles.todoPanel}>
            <div className={styles.todoPanelHeader}>
              <span className={styles.todoPanelTitel}>Vandaag</span>
              <span className={styles.todoPanelCount}>{secties.reduce((t, s) => t + s.items.length, 0)}</span>
            </div>
            <div className={styles.todoSecties}>
              {secties.map(s => (
                <div key={s.label} className={styles.todoSectie}>
                  <div className={`${styles.todoSectieHeader} ${styles[s.kleur as keyof typeof styles]}`}>
                    <span>{s.icoon}</span>
                    <span>{s.label}</span>
                    <span className={styles.todoSectieCount}>{s.items.length}</span>
                  </div>
                  {s.items.map(item => (
                    <div key={item.id} className={styles.todoRij} onClick={() => router.push(item.href)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.todoLabel}>{item.label}</div>
                        {item.sub && <div className={styles.todoSub}>{item.sub}</div>}
                      </div>
                      {item.extra && <div className={styles.todoExtra}>{item.extra}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
                {r.wie_levert_af && <div className={styles.rijInfo}>{r.wie_levert_af}</div>}
                {r.binnen_op && (
                  <div
                    className={styles.rijWarn}
                    title={new Date(r.binnen_op).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })}
                  >
                    {dagenGeleden(r.binnen_op)}dgn
                  </div>
                )}
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
                <div className={styles.rijWarn}>{dagenGeleden(r.ingekocht_op)}dgn</div>
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
