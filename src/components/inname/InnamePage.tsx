'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useInname } from '@/hooks/useInname';
import { useMedewerkers } from '@/hooks/useMedewerkers';
import { rdwOpzoeken } from '@/lib/rdw';
import type { InnameFormulier } from '@/types';
import SchadeDiagram from './SchadeDiagram';
import styles from './InnamePage.module.css';

const TANK_OPTIES = ['leeg', 'kwart', 'half', 'driekwart', 'vol'] as const;
const TANK_LABELS: Record<string, string> = { leeg: 'Leeg', kwart: '¼', half: '½', driekwart: '¾', vol: 'Vol' };
const SEIZOEN_OPTIES = ['zomer', 'winter', 'all-season'] as const;
const ITEM_LABELS: { k: string; l: string }[] = [
  { k: 'reset', l: 'Reset' }, { k: 'laadkabels', l: 'Laadkabels' },
  { k: 'sleutels', l: 'Sleutels' }, { k: 'trekhaak', l: 'Trekhaak' },
  { k: 'matten', l: 'Matten' }, { k: 'alarm', l: 'Alarm' },
];

const LEEG: Omit<InnameFormulier, 'id' | 'created_at'> = {
  kenteken: '', meldcode: '', datum: new Date().toISOString().slice(0, 10),
  inname_door: '', merk_type: '', brandstof: '',
  km_stand: undefined, laatste_beurt_datum: '', laatste_beurt_km: undefined,
  apk_geldig_tot: '',
  tankinhoud: '', band_lv: '', band_rv: '', band_la: '', band_ra: '',
  band_seizoen: '', bandenmaat: '',
  items: {}, schade_diagram: [], schade_omschrijving: '',
};

export default function InnamePage() {
  const { user } = useAuth();
  const { submit, ongekoppeld, koppelAan } = useInname();
  const { namen: medewerkersLijst } = useMedewerkers();

  const gebruikerNaam = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? '';

  const [form, setForm] = useState<Omit<InnameFormulier, 'id' | 'created_at'>>({
    ...LEEG,
    inname_door: gebruikerNaam,
  });
  const [rdwLaden, setRdwLaden] = useState(false);
  const [rdwInfo, setRdwInfo] = useState('');
  const [bezig, setBezig] = useState(false);
  const [succes, setSucces] = useState<{ after_sales_id?: string; ongekoppeld?: boolean } | null>(null);

  function stel<K extends keyof typeof form>(veld: K, waarde: typeof form[K]) {
    setForm(f => ({ ...f, [veld]: waarde }));
  }

  function toggleItem(k: string) {
    const huidig = form.items ?? {};
    stel('items', { ...huidig, [k]: !huidig[k] });
  }

  async function rdwHalen() {
    const kt = form.kenteken.replace(/-/g, '').toUpperCase();
    if (kt.length < 5) { alert('Vul eerst een kenteken in.'); return; }
    setRdwLaden(true);
    setRdwInfo('');
    try {
      const data = await rdwOpzoeken(kt);
      if (!data) { alert('Geen voertuig gevonden voor dit kenteken.'); return; }
      const merk = data.voertuig.merk
        ? data.voertuig.merk.charAt(0) + data.voertuig.merk.slice(1).toLowerCase()
        : '';
      const model = data.voertuig.handelsbenaming ?? '';
      const merkType = [merk, model].filter(Boolean).join(' ');
      setForm(f => ({
        ...f,
        merk_type: f.merk_type || merkType,
        apk_geldig_tot: f.apk_geldig_tot || (data.apkDatum
          ? data.apkDatum.split('-').reverse().join('-')
          : ''),
      }));
      setRdwInfo(merkType || 'Gevonden');
    } catch {
      alert('RDW ophalen mislukt.');
    } finally {
      setRdwLaden(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kenteken && !form.meldcode) {
      alert('Vul een kenteken of meldcode in.');
      return;
    }
    setBezig(true);
    const result = await submit({ ...form, inname_door: form.inname_door || gebruikerNaam });
    setBezig(false);
    if (result.ok) {
      setSucces({ after_sales_id: result.after_sales_id, ongekoppeld: result.ongekoppeld });
    } else {
      alert('Opslaan mislukt: ' + (result.error ?? 'onbekende fout'));
    }
  }

  function nieuwFormulier() {
    setForm({ ...LEEG, inname_door: form.inname_door });
    setSucces(null);
    setRdwInfo('');
  }

  if (succes) {
    return (
      <div className={styles.pagina}>
        <div className={styles.succes}>
          <div className={styles.succesIcoon}>{succes.ongekoppeld ? '⚠️' : '✅'}</div>
          <div className={styles.succesTitel}>
            {succes.ongekoppeld ? 'Inname opgeslagen' : 'Inname opgeslagen!'}
          </div>
          <div className={styles.succesSub}>
            {succes.ongekoppeld
              ? 'Kenteken niet gevonden in AfterSales. De inname staat in de lijst hieronder — koppel hem handmatig.'
              : 'Het formulier is gekoppeld aan de AfterSales kaart.'
            }
          </div>
          <button className="btn btn-a" onClick={nieuwFormulier}>+ Nieuwe inname</button>
        </div>

        {succes.ongekoppeld && ongekoppeld.length > 0 && (
          <OngekoppeldLijst lijst={ongekoppeld} onKoppel={koppelAan} />
        )}
      </div>
    );
  }

  const items = form.items ?? {};

  return (
    <div className={styles.pagina}>
      <div className={styles.header}>
        <div className={styles.titel}>📋 Innameformulier</div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* 1. Voertuiggegevens */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Voertuiggegevens</div>

          {/* Kenteken + Meldcode op één rij */}
          <div className={styles.kentMeldRij}>
            <div className={styles.kentMeldVeld}>
              <label className={styles.veldLabel}>Kenteken</label>
              <div className={styles.kentInputRij}>
                <input
                  className="fi"
                  placeholder="bijv. KGT38Z"
                  value={form.kenteken}
                  onChange={e => stel('kenteken', e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase' }}
                />
                <button type="button" className={styles.rdwKnop} onClick={rdwHalen} disabled={rdwLaden}>
                  {rdwLaden ? '…' : '🔍'}
                </button>
              </div>
            </div>
            <div className={styles.kentMeldVeld}>
              <label className={styles.veldLabel}>Meldcode</label>
              <input className="fi" placeholder="bijv. M-2024-001" value={form.meldcode ?? ''} onChange={e => stel('meldcode', e.target.value)} />
            </div>
          </div>

          {rdwInfo && <div className={styles.autoChip}>✓ {rdwInfo}</div>}

          <div className={styles.veldRij} style={{ marginTop: 10 }}>
            <div>
              <label className={styles.veldLabel}>Merk &amp; type</label>
              <input className="fi" placeholder="bijv. Audi Q3" value={form.merk_type ?? ''} onChange={e => stel('merk_type', e.target.value)} />
            </div>
            <div>
              <label className={styles.veldLabel}>Brandstof</label>
              <input className="fi" placeholder="bijv. Diesel" value={form.brandstof ?? ''} onChange={e => stel('brandstof', e.target.value)} />
            </div>
          </div>
        </div>

        {/* 2. Algemene gegevens */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Algemene gegevens</div>
          <div className={styles.veldRij}>
            <div>
              <label className={styles.veldLabel}>Datum inname</label>
              <input className="fi" type="date" value={form.datum ?? ''} onChange={e => stel('datum', e.target.value)} />
            </div>
            <div>
              <label className={styles.veldLabel}>Inname door</label>
              <select className="fi" value={form.inname_door ?? ''} onChange={e => stel('inname_door', e.target.value)}>
                <option value="">— kies —</option>
                {medewerkersLijst.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 3. Kilometer / onderhoud / APK */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Kilometer / Onderhoud / APK</div>
          <div className={styles.veldRij}>
            <div>
              <label className={styles.veldLabel}>Kilometerstand</label>
              <input className="fi" type="number" placeholder="bijv. 85000" value={form.km_stand ?? ''} onChange={e => stel('km_stand', e.target.value ? parseInt(e.target.value) : undefined)} />
            </div>
            <div>
              <label className={styles.veldLabel}>APK geldig tot</label>
              <input className="fi" type="date" value={form.apk_geldig_tot ?? ''} onChange={e => stel('apk_geldig_tot', e.target.value)} />
            </div>
          </div>
          <div className={styles.veldRij}>
            <div>
              <label className={styles.veldLabel}>Laatste beurt datum</label>
              <input className="fi" type="date" value={form.laatste_beurt_datum ?? ''} onChange={e => stel('laatste_beurt_datum', e.target.value)} />
            </div>
            <div>
              <label className={styles.veldLabel}>Laatste beurt km</label>
              <input className="fi" type="number" placeholder="bijv. 80000" value={form.laatste_beurt_km ?? ''} onChange={e => stel('laatste_beurt_km', e.target.value ? parseInt(e.target.value) : undefined)} />
            </div>
          </div>
        </div>

        {/* 4. Tankinhoud */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Tankinhoud</div>
          <div className={styles.tankRij}>
            {TANK_OPTIES.map(o => (
              <button
                key={o}
                type="button"
                className={`${styles.tankOptie} ${form.tankinhoud === o ? styles.actief : ''}`}
                onClick={() => stel('tankinhoud', o)}
              >
                {TANK_LABELS[o]}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Banden */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Banden (profiel in mm)</div>
          <div className={styles.bandenGrid}>
            {(['lv', 'rv', 'la', 'ra'] as const).map(pos => (
              <div key={pos}>
                <label className={styles.veldLabel}>{pos.toUpperCase()}</label>
                <input
                  className="fi"
                  type="number"
                  placeholder="mm"
                  value={(form[`band_${pos}` as keyof typeof form] as string) ?? ''}
                  onChange={e => stel(`band_${pos}` as keyof typeof form, e.target.value as never)}
                />
              </div>
            ))}
          </div>
          <div className={styles.seizoenRij}>
            {SEIZOEN_OPTIES.map(s => (
              <button
                key={s}
                type="button"
                className={`${styles.seizoenOptie} ${form.band_seizoen === s ? styles.actief : ''}`}
                onClick={() => stel('band_seizoen', s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div>
            <label className={styles.veldLabel}>Bandenmaat</label>
            <input className="fi" placeholder="bijv. 225/45R18" value={form.bandenmaat ?? ''} onChange={e => stel('bandenmaat', e.target.value)} />
          </div>
        </div>

        {/* 6. Schade / bijzonderheden */}
        <div className={styles.sectie}>
          <div className={styles.sectieTitel}>Schade / bijzonderheden</div>

          <div className={styles.checkGrid}>
            {ITEM_LABELS.map(({ k, l }) => (
              <div
                key={k}
                className={`${styles.checkItem} ${items[k] ? styles.actief : ''}`}
                onClick={() => toggleItem(k)}
              >
                <div className={styles.checkBox}>
                  {items[k] && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {l}
              </div>
            ))}
          </div>

          <SchadeDiagram
            punten={form.schade_diagram ?? []}
            onChange={p => stel('schade_diagram', p)}
          />

          <div style={{ marginTop: 12 }}>
            <label className={styles.veldLabel}>Omschrijving schade / opmerkingen</label>
            <textarea
              className="fi"
              rows={3}
              placeholder="Bijv. deuk voorbumper links, lichte kras rechterdeur..."
              value={form.schade_omschrijving ?? ''}
              onChange={e => stel('schade_omschrijving', e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className={`btn btn-a ${styles.submitKnop}`} disabled={bezig}>
          {bezig ? 'Opslaan...' : '✅ Inname verzenden'}
        </button>

      </form>

      {ongekoppeld.length > 0 && (
        <OngekoppeldLijst lijst={ongekoppeld} onKoppel={koppelAan} />
      )}
    </div>
  );
}

function OngekoppeldLijst({
  lijst,
  onKoppel,
}: {
  lijst: InnameFormulier[];
  onKoppel: (inname: InnameFormulier) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [bezig, setBezig] = useState<string | null>(null);

  async function handleKoppel(inname: InnameFormulier) {
    setBezig(inname.id);
    const result = await onKoppel(inname);
    setBezig(null);
    if (!result.ok) alert('Koppelen mislukt: ' + result.error);
  }

  return (
    <div className={styles.ongekoppeldSectie}>
      <div className={styles.ongekoppeldTitel}>⚠️ Niet gekoppeld aan AfterSales</div>
      <div className={styles.ongekoppeldSub}>Kenteken niet gevonden — controleer en koppel handmatig</div>
      {lijst.map(f => (
        <div key={f.id} className={styles.ongekoppeldItem}>
          <div className={styles.ongekoppeldInfo}>
            <span className={styles.ongekoppeldKenteken}>{f.kenteken || f.meldcode || '—'}</span>
            <span className={styles.ongekoppeldMeta}>
              {f.datum} · {f.merk_type || 'onbekend'} · {f.km_stand ? `${f.km_stand.toLocaleString('nl-NL')} km` : ''}
            </span>
          </div>
          <button
            className={styles.koppelKnop}
            onClick={() => handleKoppel(f)}
            disabled={bezig === f.id}
          >
            {bezig === f.id ? '…' : '+ AfterSales'}
          </button>
        </div>
      ))}
    </div>
  );
}
