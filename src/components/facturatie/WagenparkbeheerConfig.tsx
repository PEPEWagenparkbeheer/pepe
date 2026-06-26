'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import styles from './Facturatie.module.css';

interface Child { hubspot_company_id: string; naam: string }
interface Config {
  id: string;
  parent_hubspot_company_id: string;
  klant_naam: string | null;
  fee_per_voertuig: number;
  child_company_ids: Child[];
  betaaldag: number;
  actief: boolean;
  notitie: string | null;
}

const leeg = (): Config => ({
  id: '', parent_hubspot_company_id: '', klant_naam: '', fee_per_voertuig: 15,
  child_company_ids: [], betaaldag: 1, actief: true, notitie: '',
});

export default function WagenparkbeheerConfig() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [bewerk, setBewerk] = useState<Config | null>(null);
  const [melding, setMelding] = useState('');
  const [busy, setBusy] = useState(false);

  const laad = useCallback(async () => {
    const res = await fetch('/api/wagenparkbeheer-config', { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    setConfigs(Array.isArray(j.configs) ? j.configs : []);
  }, []);
  useEffect(() => { void laad(); }, [laad]);

  async function zoekCompany(naam: string): Promise<{ id: string; naam: string } | null> {
    if (!naam.trim()) return null;
    const res = await fetch(`/api/uitgaande-facturen/klant-lookup?naam=${encodeURIComponent(naam)}`, { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    if (j.gevonden && j.hubspot_company_id) return { id: j.hubspot_company_id, naam: j.klant_naam ?? naam };
    return null;
  }

  async function bewaar() {
    if (!bewerk) return;
    if (!bewerk.parent_hubspot_company_id) { setMelding('Koppel eerst de moedermaatschappij (zoek HubSpot).'); return; }
    setBusy(true);
    const h = await authHeaders({ 'Content-Type': 'application/json' });
    const body = JSON.stringify(bewerk);
    const res = bewerk.id
      ? await fetch(`/api/wagenparkbeheer-config/${bewerk.id}`, { method: 'PATCH', headers: h, body })
      : await fetch('/api/wagenparkbeheer-config', { method: 'POST', headers: h, body });
    setBusy(false);
    if (res.ok) { setBewerk(null); setMelding(''); await laad(); } else { setMelding('Opslaan mislukt.'); }
  }

  async function verwijder(id: string) {
    if (!confirm('Deze config verwijderen?')) return;
    const h = await authHeaders();
    await fetch(`/api/wagenparkbeheer-config/${id}`, { method: 'DELETE', headers: h });
    await laad();
  }

  async function genereerNu() {
    setBusy(true); setMelding('Concepten genereren…');
    const res = await fetch('/api/facturatie/wagenparkbeheer-cron', { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      const r = (j.resultaat ?? []).map((x: { klant: string; status: string; aantal?: number }) => `${x.klant}: ${x.status}${x.aantal != null ? ` (${x.aantal})` : ''}`).join(' · ');
      setMelding(`Periode ${j.periode} — ${r || 'niets te doen'}`);
    } else { setMelding(j.error ?? 'Genereren mislukt'); }
    await laad();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Wagenparkbeheer — configuratie</h1>
          <p className={styles.sub}>Fee per voertuig per klant · maandelijkse concepten verschijnen in <Link href="/facturatie">Facturatie</Link></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.secondary} onClick={genereerNu} disabled={busy}>Genereer concepten nu</button>
          <button className={styles.primary} onClick={() => setBewerk(leeg())}>+ Nieuwe klant</button>
        </div>
      </header>

      {melding && <p className={styles.infoBox}>{melding}</p>}

      <table className={styles.table}>
        <thead>
          <tr><th>Moedermaatschappij</th><th>Fee/voertuig</th><th>Dochters</th><th>Actief</th><th></th></tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id} className={styles.row}>
              <td onClick={() => setBewerk({ ...c, child_company_ids: c.child_company_ids ?? [] })}>{c.klant_naam || c.parent_hubspot_company_id}</td>
              <td>€ {Number(c.fee_per_voertuig).toFixed(2)}</td>
              <td>{(c.child_company_ids ?? []).length}</td>
              <td>{c.actief ? 'ja' : 'nee'}</td>
              <td><button className={styles.removeBtn} onClick={() => verwijder(c.id)}>×</button></td>
            </tr>
          ))}
          {configs.length === 0 && <tr><td colSpan={5} className={styles.empty}>Nog geen klanten geconfigureerd.</td></tr>}
        </tbody>
      </table>

      {bewerk && (
        <ConfigModal
          config={bewerk}
          setConfig={setBewerk}
          zoekCompany={zoekCompany}
          onSave={bewaar}
          onClose={() => setBewerk(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

function ConfigModal({
  config, setConfig, zoekCompany, onSave, onClose, busy,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  zoekCompany: (naam: string) => Promise<{ id: string; naam: string } | null>;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [parentZoek, setParentZoek] = useState(config.klant_naam ?? '');
  const [childZoek, setChildZoek] = useState('');
  const [zoekBusy, setZoekBusy] = useState(false);

  async function koppelParent() {
    setZoekBusy(true);
    const r = await zoekCompany(parentZoek);
    setZoekBusy(false);
    if (r) setConfig({ ...config, parent_hubspot_company_id: r.id, klant_naam: r.naam });
  }
  async function voegChildToe() {
    setZoekBusy(true);
    const r = await zoekCompany(childZoek);
    setZoekBusy(false);
    if (r) {
      setConfig({ ...config, child_company_ids: [...config.child_company_ids, { hubspot_company_id: r.id, naam: r.naam }] });
      setChildZoek('');
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <span className={styles.modalTitle}>{config.id ? 'Klant bewerken' : 'Nieuwe klant'}</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.sectieKop}>Moedermaatschappij (debiteur)</div>
          <div className={styles.zoekRij}>
            <input placeholder="Zoek bedrijfsnaam in HubSpot…" value={parentZoek} onChange={(e) => setParentZoek(e.target.value)} />
            <button className={styles.addBtn} onClick={koppelParent} disabled={zoekBusy}>Koppel</button>
          </div>
          {config.parent_hubspot_company_id && <p className={styles.sub}>✓ {config.klant_naam} ({config.parent_hubspot_company_id})</p>}

          <div className={styles.formGrid}>
            <div className={styles.veld}><span className={styles.label}>Fee per voertuig (€)</span>
              <input className={styles.input} type="number" step="0.01" value={config.fee_per_voertuig} onChange={(e) => setConfig({ ...config, fee_per_voertuig: Number(e.target.value) })} /></div>
            <div className={styles.veld}><span className={styles.label}>Betaaldag (dag v/d maand)</span>
              <input className={styles.input} type="number" value={config.betaaldag} onChange={(e) => setConfig({ ...config, betaaldag: Number(e.target.value) })} /></div>
            <div className={styles.veld}><span className={styles.label}>Actief</span>
              <select className={styles.select} value={config.actief ? 'ja' : 'nee'} onChange={(e) => setConfig({ ...config, actief: e.target.value === 'ja' })}>
                <option value="ja">Ja</option><option value="nee">Nee</option>
              </select></div>
          </div>

          <div className={styles.sectieKop}>Dochterondernemingen (entiteiten op de bijlage)</div>
          <div className={styles.zoekRij}>
            <input placeholder="Zoek dochteronderneming in HubSpot…" value={childZoek} onChange={(e) => setChildZoek(e.target.value)} />
            <button className={styles.addBtn} onClick={voegChildToe} disabled={zoekBusy}>+ Toevoegen</button>
          </div>
          <table className={styles.regelTable}>
            <tbody>
              {config.child_company_ids.map((c, i) => (
                <tr key={i}>
                  <td>{c.naam}</td>
                  <td className={styles.sub}>{c.hubspot_company_id}</td>
                  <td><button className={styles.removeBtn} onClick={() => setConfig({ ...config, child_company_ids: config.child_company_ids.filter((_, idx) => idx !== i) })}>×</button></td>
                </tr>
              ))}
              {config.child_company_ids.length === 0 && <tr><td className={styles.sub}>Nog geen dochters gekoppeld.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className={styles.modalFooter}>
          <button className={styles.secondary} onClick={onClose} disabled={busy}>Annuleren</button>
          <button className={styles.primary} onClick={onSave} disabled={busy}>Opslaan</button>
        </footer>
      </div>
    </div>
  );
}
