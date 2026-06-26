'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import styles from './Facturatie.module.css';

interface Child { hubspot_company_id: string; naam: string; aantal?: number; checked?: boolean }
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

  async function bewaar(cfg: Config) {
    if (!cfg.parent_hubspot_company_id) { setMelding('Koppel eerst de moedermaatschappij.'); return; }
    setBusy(true);
    const h = await authHeaders({ 'Content-Type': 'application/json' });
    // alleen aangevinkte dochters opslaan
    const body = JSON.stringify({
      ...cfg,
      child_company_ids: cfg.child_company_ids
        .filter((c) => c.checked !== false)
        .map((c) => ({ hubspot_company_id: c.hubspot_company_id, naam: c.naam })),
    });
    const res = cfg.id
      ? await fetch(`/api/wagenparkbeheer-config/${cfg.id}`, { method: 'PATCH', headers: h, body })
      : await fetch('/api/wagenparkbeheer-config', { method: 'POST', headers: h, body });
    setBusy(false);
    if (res.ok) { setBewerk(null); setMelding(''); await laad(); } else { setMelding('Opslaan mislukt.'); }
  }

  async function verwijder(id: string) {
    if (!confirm('Deze config verwijderen?')) return;
    await fetch(`/api/wagenparkbeheer-config/${id}`, { method: 'DELETE', headers: await authHeaders() });
    await laad();
  }

  async function genereerNu() {
    if (!confirm('Conceptfacturen voor deze maand klaarzetten in Facturatie?')) return;
    setBusy(true); setMelding('Concepten genereren…');
    const res = await fetch('/api/facturatie/wagenparkbeheer-cron', { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      const r = (j.resultaat ?? []).map((x: { klant: string; status: string; aantal?: number }) => `${x.klant}: ${x.status}${x.aantal != null ? ` (${x.aantal})` : ''}`).join(' · ');
      setMelding(`Periode ${j.periode} — ${r || 'niets klaargezet'}. Bekijk + verstuur in Facturatie.`);
      await laad();
    } else setMelding(j.error ?? 'Genereren mislukt');
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

      <div className={styles.infoBox}>
        <strong>Hoe werkt het?</strong> Stel hier per klant de fee en dochterondernemingen in.
        Elke maand (op de betaaldag) zet Flow automatisch een <strong>conceptfactuur</strong> klaar in
        <Link href="/facturatie"> Facturatie</Link> met de maandfee (aantal = rijdende voertuigen) + bijlage per dochter.
        Daar kun je <strong>extra regels toevoegen</strong> (consultancy, transport, inbouw), de
        <strong> PDF-preview</strong> bekijken en de factuur <strong>versturen</strong>. Of klik nu op
        &quot;Genereer concepten nu&quot;.
      </div>

      {melding && <p className={styles.infoBox}>{melding}</p>}

      <table className={styles.table}>
        <thead>
          <tr><th>Moedermaatschappij</th><th>Fee/voertuig</th><th>Dochters</th><th>Betaaldag</th><th>Actief</th><th></th></tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id} className={styles.row}>
              <td onClick={() => setBewerk({ ...c, child_company_ids: (c.child_company_ids ?? []).map((x) => ({ ...x, checked: true })) })}>{c.klant_naam || c.parent_hubspot_company_id}</td>
              <td>€ {Number(c.fee_per_voertuig).toFixed(2)}</td>
              <td>{(c.child_company_ids ?? []).length}</td>
              <td>{c.betaaldag}e</td>
              <td>{c.actief ? 'ja' : 'nee'}</td>
              <td><button className={styles.removeBtn} onClick={() => verwijder(c.id)}>×</button></td>
            </tr>
          ))}
          {configs.length === 0 && <tr><td colSpan={6} className={styles.empty}>Nog geen klanten geconfigureerd.</td></tr>}
        </tbody>
      </table>

      {bewerk && <ConfigModal start={bewerk} onSave={bewaar} onClose={() => setBewerk(null)} busy={busy} />}
    </div>
  );
}

// ── Bewerk-modal met live HubSpot-zoeken + automatische dochters ────────────
function ConfigModal({
  start, onSave, onClose, busy,
}: { start: Config; onSave: (c: Config) => void; onClose: () => void; busy: boolean }) {
  const [cfg, setCfg] = useState<Config>(start);
  const [parentZoek, setParentZoek] = useState(start.klant_naam ?? '');
  const [parentSug, setParentSug] = useState<{ id: string; naam: string }[]>([]);
  const [childZoek, setChildZoek] = useState('');
  const [childSug, setChildSug] = useState<{ id: string; naam: string }[]>([]);
  const [laadtDochters, setLaadtDochters] = useState(false);

  async function zoek(q: string, setter: (v: { id: string; naam: string }[]) => void) {
    if (q.trim().length < 2) { setter([]); return; }
    const res = await fetch(`/api/uitgaande-facturen/company-search?q=${encodeURIComponent(q)}`, { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    setter(Array.isArray(j.resultaten) ? j.resultaten : []);
  }

  async function laadDochters(parentId: string, bestaand: Child[]) {
    setLaadtDochters(true);
    const res = await fetch(`/api/uitgaande-facturen/company-children?parentId=${parentId}`, { headers: await authHeaders() });
    const j = await res.json().catch(() => ({}));
    const live: Child[] = Array.isArray(j.dochters) ? j.dochters : [];
    // merge: live dochters (aangevinkt) + handmatig toegevoegde die niet in live zitten
    const liveIds = new Set(live.map((d) => d.hubspot_company_id));
    const extra = bestaand.filter((b) => !liveIds.has(b.hubspot_company_id));
    setCfg((c) => ({
      ...c,
      child_company_ids: [
        ...live.map((d) => ({ ...d, checked: true })),
        ...extra.map((e) => ({ ...e, checked: e.checked !== false })),
      ],
    }));
    setLaadtDochters(false);
  }

  async function kiesParent(s: { id: string; naam: string }) {
    setCfg((c) => ({ ...c, parent_hubspot_company_id: s.id, klant_naam: s.naam }));
    setParentZoek(s.naam);
    setParentSug([]);
    await laadDochters(s.id, cfg.child_company_ids);
  }

  function voegChildToe(s: { id: string; naam: string }) {
    setCfg((c) => c.child_company_ids.some((x) => x.hubspot_company_id === s.id)
      ? c
      : { ...c, child_company_ids: [...c.child_company_ids, { hubspot_company_id: s.id, naam: s.naam, checked: true }] });
    setChildZoek(''); setChildSug([]);
  }

  function toggleChild(id: string) {
    setCfg((c) => ({ ...c, child_company_ids: c.child_company_ids.map((x) => x.hubspot_company_id === id ? { ...x, checked: x.checked === false } : x) }));
  }

  const totaalVoertuigen = cfg.child_company_ids.filter((c) => c.checked !== false).reduce((s, c) => s + (c.aantal ?? 0), 0);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <span className={styles.modalTitle}>{cfg.id ? 'Klant bewerken' : 'Nieuwe klant'}</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.sectieKop}>Moedermaatschappij (debiteur)</div>
          <div className={styles.zoekRij}>
            <input
              placeholder="Typ bedrijfsnaam (min. 2 letters)…"
              value={parentZoek}
              onChange={(e) => { setParentZoek(e.target.value); void zoek(e.target.value, setParentSug); }}
            />
          </div>
          {parentSug.length > 0 && (
            <div className={styles.sugList}>
              {parentSug.map((s) => (
                <button key={s.id} className={styles.sugItem} onClick={() => kiesParent(s)}>{s.naam}</button>
              ))}
            </div>
          )}
          {cfg.parent_hubspot_company_id && <p className={styles.sub}>✓ {cfg.klant_naam} ({cfg.parent_hubspot_company_id})</p>}

          <div className={styles.formGrid}>
            <div className={styles.veld}><span className={styles.label}>Fee per voertuig (€)</span>
              <input className={styles.input} type="number" step="0.01" value={cfg.fee_per_voertuig} onChange={(e) => setCfg({ ...cfg, fee_per_voertuig: Number(e.target.value) })} /></div>
            <div className={styles.veld}><span className={styles.label}>Betaaldag (dag v/d maand)</span>
              <input className={styles.input} type="number" value={cfg.betaaldag} onChange={(e) => setCfg({ ...cfg, betaaldag: Number(e.target.value) })} /></div>
            <div className={styles.veld}><span className={styles.label}>Actief</span>
              <select className={styles.select} value={cfg.actief ? 'ja' : 'nee'} onChange={(e) => setCfg({ ...cfg, actief: e.target.value === 'ja' })}>
                <option value="ja">Ja</option><option value="nee">Nee</option>
              </select></div>
          </div>

          <div className={styles.sectieKop}>
            Dochterondernemingen {laadtDochters ? '(laden…)' : `(${cfg.child_company_ids.filter((c) => c.checked !== false).length} actief · ${totaalVoertuigen} rijdende voertuigen)`}
          </div>
          <p className={styles.sub}>Automatisch opgehaald uit HubSpot. Aangevinkte dochters staan op de factuur (incl. bijlage met kentekens).</p>
          <table className={styles.regelTable}>
            <tbody>
              {cfg.child_company_ids.map((c) => (
                <tr key={c.hubspot_company_id}>
                  <td style={{ width: 28 }}>
                    <input type="checkbox" checked={c.checked !== false} onChange={() => toggleChild(c.hubspot_company_id)} />
                  </td>
                  <td>{c.naam}</td>
                  <td style={{ textAlign: 'right' }}>{c.aantal != null ? `${c.aantal} rijdend` : '—'}</td>
                  <td className={styles.sub} style={{ width: 90 }}>{c.hubspot_company_id}</td>
                </tr>
              ))}
              {cfg.child_company_ids.length === 0 && <tr><td className={styles.sub}>Nog geen dochters (kies eerst een moedermaatschappij of voeg handmatig toe).</td></tr>}
            </tbody>
          </table>
          <div className={styles.zoekRij}>
            <input placeholder="Extra dochter toevoegen (typ naam)…" value={childZoek} onChange={(e) => { setChildZoek(e.target.value); void zoek(e.target.value, setChildSug); }} />
          </div>
          {childSug.length > 0 && (
            <div className={styles.sugList}>
              {childSug.map((s) => (
                <button key={s.id} className={styles.sugItem} onClick={() => voegChildToe(s)}>{s.naam}</button>
              ))}
            </div>
          )}
        </div>
        <footer className={styles.modalFooter}>
          <button className={styles.secondary} onClick={onClose} disabled={busy}>Annuleren</button>
          <button className={styles.primary} onClick={() => onSave(cfg)} disabled={busy}>Opslaan</button>
        </footer>
      </div>
    </div>
  );
}
