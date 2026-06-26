'use client';

import { useState, useEffect } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import { berekenTotalen } from '@/lib/factuur/btw';
import { createFactuurPdfBase64 } from '@/lib/factuur/pdf';
import type { UitgaandeFactuur, FactuurType, FactuurRegel, BtwCode } from '@/types/factuur';
import styles from './Facturatie.module.css';

type Tab = 'klant' | 'voertuig' | 'regels' | 'samenvatting';

interface Props {
  factuur: UitgaandeFactuur | null;  // null = nieuw
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const TYPE_OPTIES: { value: FactuurType; label: string }[] = [
  { value: 'auto', label: '🚗 Auto (margeregeling)' },
  { value: 'wagenparkbeheer', label: '🏢 Wagenparkbeheer fee' },
  { value: 'shortlease', label: '📋 Shortlease doorbelasting' },
  { value: 'werk_derden', label: '🔨 Werk derden' },
  { value: 'diensten_overig', label: '📄 Diensten overig' },
];

const BTW_OPTIES: { value: BtwCode; label: string }[] = [
  { value: 'hoog', label: '21%' },
  { value: 'geen', label: 'Vrijgesteld (0%)' },
  { value: 'marge', label: 'Margeregeling' },
];

const leegRegel = (): FactuurRegel => ({ omschrijving: '', aantal: 1, prijs_excl: 0, btw_code: 'hoog' });

function euro(n: number) {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export default function FactuurModal({ factuur, onClose, onSaved }: Props) {
  const isNieuw = !factuur;
  const [type, setType] = useState<FactuurType>(factuur?.type ?? 'diensten_overig');
  const [soort] = useState(factuur?.soort ?? 'factuur');
  const [tab, setTab] = useState<Tab>('klant');
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const isAuto = type === 'auto';

  // Klant
  const [klantNaam, setKlantNaam] = useState(factuur?.klant_naam ?? '');
  const [tav, setTav] = useState(factuur?.tav ?? '');
  const [adres, setAdres] = useState(factuur?.adres ?? '');
  const [postcode, setPostcode] = useState(factuur?.postcode ?? '');
  const [plaats, setPlaats] = useState(factuur?.plaats ?? '');
  const [email, setEmail] = useState(factuur?.email ?? '');
  const [factuurEmail, setFactuurEmail] = useState(factuur?.factuur_email ?? '');
  const [kvk, setKvk] = useState(factuur?.kvk ?? '');
  const [btwNummer, setBtwNummer] = useState(factuur?.btw_nummer ?? '');
  const [zoekKvk, setZoekKvk] = useState('');
  const [zoekNaam, setZoekNaam] = useState('');
  const [zoekBezig, setZoekBezig] = useState(false);
  const [hubspotCompanyId, setHubspotCompanyId] = useState<string | null>(factuur?.hubspot_company_id ?? null);

  // Voertuig (alleen auto)
  const [kenteken, setKenteken] = useState(factuur?.voertuig?.kenteken ?? '');
  const [chassis, setChassis] = useState(factuur?.voertuig?.chassis ?? '');
  const [merk, setMerk] = useState(factuur?.voertuig?.merk ?? '');
  const [model, setModel] = useState(factuur?.voertuig?.model ?? '');
  const [kleur, setKleur] = useState(factuur?.voertuig?.kleur ?? '');
  const [kmStand, setKmStand] = useState(factuur?.voertuig?.km_stand?.toString() ?? '');
  const [datumDeel1a, setDatumDeel1a] = useState(factuur?.voertuig?.datum_deel1a ?? '');
  const [brutoBpm, setBrutoBpm] = useState(factuur?.voertuig?.bruto_bpm?.toString() ?? '');
  const [restBpm, setRestBpm] = useState(factuur?.voertuig?.rest_bpm?.toString() ?? '');
  const [bpmMethode, setBpmMethode] = useState(factuur?.voertuig?.bpm_methode ?? 'handmatig');
  const [rdwBezig, setRdwBezig] = useState(false);

  // Regels
  const [regels, setRegels] = useState<FactuurRegel[]>(
    factuur?.regels?.length ? (factuur.regels as FactuurRegel[]) : [leegRegel()],
  );

  // Misc
  const [betaaltermijn, setBetaaltermijn] = useState(factuur?.betaaltermijn_dagen ?? 14);
  const [notitie, setNotitie] = useState(factuur?.notitie ?? '');

  // Auto-BTW instellen als type=auto
  useEffect(() => {
    if (isAuto && regels.length > 0 && regels[0].btw_code !== 'marge') {
      setRegels((rs) => rs.map((r) => ({ ...r, btw_code: 'marge' as BtwCode })));
    }
  }, [isAuto]);

  const totalen = berekenTotalen(regels);

  // ── Klant zoeken ──
  async function zoekKlant(veld: 'kvk' | 'naam') {
    const q = veld === 'kvk' ? zoekKvk : zoekNaam;
    if (!q.trim()) return;
    setZoekBezig(true);
    setFout(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/uitgaande-facturen/klant-lookup?${veld}=${encodeURIComponent(q)}`, { headers: h });
      const json = await res.json();
      if (json.gevonden) {
        if (json.klant_naam) setKlantNaam(json.klant_naam);
        if (json.adres) setAdres(json.adres);
        if (json.postcode) setPostcode(json.postcode);
        if (json.plaats) setPlaats(json.plaats);
        if (json.email) setEmail(json.email);
        if (json.kvk) setKvk(json.kvk);
        if (json.hubspot_company_id) setHubspotCompanyId(json.hubspot_company_id);
      } else {
        setFout('Klant niet gevonden in HubSpot.');
      }
    } catch { setFout('Fout bij opzoeken klant.'); }
    setZoekBezig(false);
  }

  // ── RDW lookup ──
  async function rdwLookup() {
    if (!kenteken) return;
    setRdwBezig(true);
    setFout(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/rdw?kenteken=${kenteken.replace(/\s/g, '').toUpperCase()}`, { headers: h });
      const json = await res.json();
      if (json.gevonden) {
        if (json.merk) setMerk(json.merk);
        if (json.model) setModel(json.model);
        if (json.kleur) setKleur(json.kleur);
        if (json.datum_deel1a) setDatumDeel1a(json.datum_deel1a);
      } else {
        setFout('Kenteken niet gevonden in RDW.');
      }
    } catch { setFout('Fout bij RDW-opzoeken.'); }
    setRdwBezig(false);
  }

  // ── Opslaan ──
  function bouwBody() {
    return {
      type,
      soort,
      hubspot_company_id: hubspotCompanyId,
      klant_naam: klantNaam || null,
      tav: tav || null,
      adres: adres || null,
      postcode: postcode || null,
      plaats: plaats || null,
      email: email || null,
      factuur_email: factuurEmail || null,
      kvk: kvk || null,
      btw_nummer: btwNummer || null,
      betaaltermijn_dagen: betaaltermijn,
      regels,
      voertuig: isAuto ? {
        kenteken: kenteken || null,
        chassis: chassis || null,
        merk: merk || null,
        model: model || null,
        kleur: kleur || null,
        km_stand: kmStand ? Number(kmStand) : null,
        datum_deel1a: datumDeel1a || null,
        bruto_bpm: brutoBpm ? Number(brutoBpm) : null,
        rest_bpm: restBpm ? Number(restBpm) : null,
        bpm_methode: bpmMethode,
        btw_soort: 'marge',
      } : null,
      status: isAuto && !kenteken ? 'aanvullen' : 'concept',
      notitie: notitie || null,
    };
  }

  async function opslaan() {
    setBezig('Opslaan…'); setFout(null);
    const h = await authHeaders({ 'Content-Type': 'application/json' });
    try {
      const url = factuur ? `/api/uitgaande-facturen/${factuur.id}` : '/api/uitgaande-facturen';
      const method = factuur ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: h, body: JSON.stringify(bouwBody()) });
      const json = await res.json();
      if (!res.ok) { setFout(json.error ?? 'Onbekende fout'); setBezig(null); return; }
      await onSaved();
    } catch (e) { setFout(String(e)); }
    setBezig(null);
  }

  async function akkoordVerstuur() {
    if (!factuur) { await opslaan(); return; }
    setBezig('Boeken in Twinfield…'); setFout(null);

    // 1. Patch laatste wijzigingen
    const h = await authHeaders({ 'Content-Type': 'application/json' });
    const patchRes = await fetch(`/api/uitgaande-facturen/${factuur.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(bouwBody()) });
    if (!patchRes.ok) { const j = await patchRes.json(); setFout(j.error ?? 'Patch mislukt'); setBezig(null); return; }
    const { factuur: gepatchte } = await patchRes.json();

    // 2. Boeken in Twinfield
    const akkoordRes = await fetch(`/api/uitgaande-facturen/${factuur.id}/akkoord-verstuur`, { method: 'POST', headers: h });
    if (!akkoordRes.ok) { const j = await akkoordRes.json(); setFout(j.error ?? 'Twinfield-boeking mislukt'); setBezig(null); return; }
    const { factuur: definitief } = await akkoordRes.json();

    // 3. PDF genereren (client-side)
    setBezig('PDF genereren…');
    let pdfBase64: string;
    try {
      pdfBase64 = await createFactuurPdfBase64({ ...gepatchte, ...definitief });
    } catch (e) { setFout(`PDF-fout: ${String(e)}`); setBezig(null); return; }

    // 4. Verzenden (opslaan + mail)
    setBezig('Verzenden…');
    const verzendRes = await fetch(`/api/uitgaande-facturen/${factuur.id}/verzend`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ pdfBase64, to: factuurEmail || email }),
    });
    if (!verzendRes.ok) {
      const j = await verzendRes.json();
      setFout(j.error ?? 'Mail mislukt' + (j.pdfOpgeslagen ? ' (PDF wel opgeslagen)' : ''));
      setBezig(null);
      return;
    }

    await onSaved();
    setBezig(null);
  }

  const kanVersturen = !!factuur && ['concept', 'aanvullen', 'ter_controle', 'definitief'].includes(factuur.status);
  const kanAanpassen = !factuur || !['definitief', 'verzonden', 'geannuleerd'].includes(factuur.status);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'klant', label: 'Klant' },
    ...(isAuto ? [{ key: 'voertuig' as Tab, label: 'Voertuig' }] : []),
    { key: 'regels', label: 'Regels' },
    { key: 'samenvatting', label: 'Samenvatting' },
  ];

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>
              {isNieuw ? 'Nieuwe factuur' : `Factuur${factuur?.factuurnummer ? ` ${factuur.factuurnummer}` : ''}`}
            </div>
            {isNieuw && (
              <select value={type} onChange={(e) => setType(e.target.value as FactuurType)} style={{ fontSize: 12, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px' }}>
                {TYPE_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className={styles.modalTabs}>
          {tabs.map((t) => (
            <button key={t.key} className={`${styles.modalTab} ${tab === t.key ? styles.modalTabActive : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* ── Klant ── */}
          {tab === 'klant' && (
            <>
              <div className={styles.zoekRij}>
                <input placeholder="KVK-nummer zoeken…" value={zoekKvk} onChange={e => setZoekKvk(e.target.value)} onKeyDown={e => e.key === 'Enter' && zoekKlant('kvk')} />
                <button className={styles.secondary} onClick={() => zoekKlant('kvk')} disabled={zoekBezig}>Zoek KVK</button>
                <input placeholder="Bedrijfsnaam zoeken…" value={zoekNaam} onChange={e => setZoekNaam(e.target.value)} onKeyDown={e => e.key === 'Enter' && zoekKlant('naam')} />
                <button className={styles.secondary} onClick={() => zoekKlant('naam')} disabled={zoekBezig}>Zoek naam</button>
              </div>
              <div className={styles.formGrid}>
                {[
                  ['Bedrijfsnaam *', klantNaam, setKlantNaam],
                  ['T.a.v.', tav, setTav],
                  ['Adres', adres, setAdres],
                  ['Postcode', postcode, setPostcode],
                  ['Plaats', plaats, setPlaats],
                  ['E-mail (contact)', email, setEmail],
                  ['Factuur e-mail', factuurEmail, setFactuurEmail],
                  ['KVK-nummer', kvk, setKvk],
                  ['BTW-nummer', btwNummer, setBtwNummer],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className={styles.veld}>
                    <label className={styles.label}>{label as string}</label>
                    <input className={styles.input} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)} readOnly={!kanAanpassen} />
                  </div>
                ))}
                <div className={styles.veld}>
                  <label className={styles.label}>Betaaltermijn (dagen)</label>
                  <input className={styles.input} type="number" value={betaaltermijn} onChange={e => setBetaaltermijn(Number(e.target.value))} readOnly={!kanAanpassen} />
                </div>
                <div className={styles.veld} style={{ gridColumn: '1/-1' }}>
                  <label className={styles.label}>Notitie (intern)</label>
                  <input className={styles.input} value={notitie} onChange={e => setNotitie(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* ── Voertuig ── */}
          {tab === 'voertuig' && isAuto && (
            <>
              {!kenteken && (
                <div className={styles.infoBox}>
                  💡 Kenteken nog onbekend? Sla de factuur op als <strong>aanvullen</strong>. Het kenteken kan later worden toegevoegd vóór boeking.
                </div>
              )}
              <div className={styles.zoekRij}>
                <input placeholder="Kenteken (bijv. XX123X)" value={kenteken} onChange={e => setKenteken(e.target.value.toUpperCase())} />
                <button className={styles.secondary} onClick={rdwLookup} disabled={rdwBezig || !kenteken}>
                  {rdwBezig ? 'Ophalen…' : 'RDW opzoeken'}
                </button>
              </div>
              <div className={styles.formGrid}>
                {[
                  ['Chassisnummer', chassis, setChassis],
                  ['Merk', merk, setMerk],
                  ['Model', model, setModel],
                  ['Kleur', kleur, setKleur],
                  ['Km-stand', kmStand, setKmStand],
                  ['Datum deel 1A', datumDeel1a, setDatumDeel1a],
                  ['Bruto BPM (€)', brutoBpm, setBrutoBpm],
                  ['Rest BPM (€)', restBpm, setRestBpm],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className={styles.veld}>
                    <label className={styles.label}>{label as string}</label>
                    <input className={styles.input} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)} readOnly={!kanAanpassen} />
                  </div>
                ))}
                <div className={styles.veld}>
                  <label className={styles.label}>BPM-methode</label>
                  <select className={styles.select} value={bpmMethode} onChange={e => setBpmMethode(e.target.value)}>
                    <option value="handmatig">Handmatig (VWE-website)</option>
                    <option value="autotelex">AutotelexPRO (toekomst)</option>
                    <option value="vwe">VWE-API (toekomst)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Regels ── */}
          {tab === 'regels' && (
            <>
              {isAuto && (
                <div className={styles.infoBox}>
                  Auto-verkoop = margeregeling: geen BTW-uitsplitsing op factuur. Alle regels krijgen BTW-code <strong>Marge</strong>.
                </div>
              )}
              <table className={styles.regelTable}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Omschrijving</th>
                    <th style={{ width: 60 }}>Aantal</th>
                    <th style={{ width: 100 }}>Prijs excl.</th>
                    <th style={{ width: 120 }}>BTW</th>
                    <th style={{ width: 100 }}>Totaal excl.</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {regels.map((r, i) => {
                    const totaal = Math.round(r.aantal * r.prijs_excl * 100) / 100;
                    return (
                      <tr key={i}>
                        <td><input value={r.omschrijving} onChange={e => setRegels(rs => rs.map((x, j) => j === i ? { ...x, omschrijving: e.target.value } : x))} readOnly={!kanAanpassen} /></td>
                        <td><input type="number" value={r.aantal} onChange={e => setRegels(rs => rs.map((x, j) => j === i ? { ...x, aantal: Number(e.target.value) } : x))} readOnly={!kanAanpassen} /></td>
                        <td><input type="number" step="0.01" value={r.prijs_excl} onChange={e => setRegels(rs => rs.map((x, j) => j === i ? { ...x, prijs_excl: Number(e.target.value) } : x))} readOnly={!kanAanpassen} /></td>
                        <td>
                          <select value={r.btw_code} onChange={e => setRegels(rs => rs.map((x, j) => j === i ? { ...x, btw_code: e.target.value as BtwCode } : x))} disabled={isAuto || !kanAanpassen}>
                            {BTW_OPTIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 8 }}>{euro(totaal)}</td>
                        <td>{kanAanpassen && <button className={styles.removeBtn} onClick={() => setRegels(rs => rs.filter((_, j) => j !== i))}>×</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {kanAanpassen && (
                <button className={styles.addBtn} onClick={() => setRegels(rs => [...rs, { ...leegRegel(), btw_code: isAuto ? 'marge' : 'hoog' }])}>
                  + Regel toevoegen
                </button>
              )}
            </>
          )}

          {/* ── Samenvatting ── */}
          {tab === 'samenvatting' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div className={styles.sectieKop}>Factuurgegevens</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Klant</span><span>{klantNaam || '—'}</span>
                  <span style={{ color: '#6b7280' }}>Type</span><span>{TYPE_OPTIES.find(o => o.value === type)?.label}</span>
                  {isAuto && <><span style={{ color: '#6b7280' }}>Voertuig</span><span>{[merk, model].filter(Boolean).join(' ') || '—'} {kenteken && `(${kenteken})`}</span></>}
                  <span style={{ color: '#6b7280' }}>Betaaltermijn</span><span>{betaaltermijn} dagen</span>
                </div>
              </div>
              <div className={styles.totaalBlok}>
                <div className={styles.totaalRij}><span>Subtotaal excl. BTW</span><span>{euro(totalen.totaal_excl)}</span></div>
                {totalen.btw_spec.map(s => (
                  <div key={s.naam} className={styles.totaalRij}><span>BTW {s.naam}</span><span>{euro(s.btw)}</span></div>
                ))}
                <div className={`${styles.totaalRij} ${styles.vet}`}><span>Totaal incl. BTW</span><span>{euro(totalen.totaal_incl)}</span></div>
              </div>
              {isAuto && (
                <div className={styles.infoBox} style={{ marginTop: 16 }}>
                  ⚠️ Betaaltekst: <em>&quot;Gelieve te verzekeren {kenteken ? `(${kenteken})` : '(kenteken nog onbekend)'} en te betalen alvorens levering.&quot;</em>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          {fout && <span className={styles.foutTekst}>⚠️ {fout}</span>}
          {factuur && kanAanpassen && !['definitief', 'verzonden'].includes(factuur.status) && (
            <button
              className={styles.danger}
              onClick={async () => {
                if (!confirm('Factuur annuleren?')) return;
                const h = await authHeaders({ 'Content-Type': 'application/json' });
                await fetch(`/api/uitgaande-facturen/${factuur.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'geannuleerd' }) });
                await onSaved();
              }}
            >
              Annuleren
            </button>
          )}
          {factuur && factuur.status === 'verzonden' && (
            <button
              className={styles.secondary}
              onClick={async () => {
                const h = await authHeaders({ 'Content-Type': 'application/json' });
                const res = await fetch(`/api/uitgaande-facturen/${factuur.id}/crediteer`, { method: 'POST', headers: h });
                const json = await res.json();
                if (res.ok) await onSaved();
                else setFout(json.error ?? 'Crediteren mislukt');
              }}
            >
              Creditnota maken
            </button>
          )}
          <button className={styles.secondary} onClick={onClose}>Sluiten</button>
          {kanAanpassen && (
            <button className={styles.secondary} onClick={opslaan} disabled={!!bezig}>
              {bezig === 'Opslaan…' ? 'Bezig…' : 'Opslaan'}
            </button>
          )}
          {kanVersturen && (
            <button className={styles.primary} onClick={akkoordVerstuur} disabled={!!bezig}>
              {bezig ?? '✓ Akkoord & verstuur'}
            </button>
          )}
          {isNieuw && (
            <button className={styles.primary} onClick={opslaan} disabled={!!bezig}>
              {bezig ?? 'Aanmaken'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
