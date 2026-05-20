'use client';

import { useState } from 'react';
import type { TenderInput, LeasenormConfig, OptieItem } from '@/lib/types/tender';
import { PORTALEN } from '@/lib/types/tender';
import styles from './TenderConfirmModal.module.css';

interface Props {
  input: TenderInput;
  rawEmail: string;
  onSluiten: () => void;
  onReset: () => void;
}

export default function TenderConfirmModal({ input, rawEmail, onSluiten, onReset }: Props) {
  const [form, setForm] = useState<TenderInput>(input);
  const [opslaan, setOpslaan] = useState(false);

  function stel<K extends keyof TenderInput>(veld: K, w: TenderInput[K]) {
    setForm((f) => ({ ...f, [veld]: w }));
  }

  function stelNorm<K extends keyof LeasenormConfig>(veld: K, w: LeasenormConfig[K]) {
    setForm((f) => ({ ...f, leasenorm: { ...f.leasenorm, [veld]: w } }));
  }

  function updateOptie(idx: number, optie: OptieItem) {
    setForm((f) => ({ ...f, opties: f.opties.map((o, i) => (i === idx ? optie : o)) }));
  }
  function verwijderOptie(idx: number) {
    setForm((f) => ({ ...f, opties: f.opties.filter((_, i) => i !== idx) }));
  }
  function voegOptieToe() {
    setForm((f) => ({ ...f, opties: [...f.opties, { naam: '', type: 'optie' }] }));
  }

  async function startVergelijking() {
    if (form.prijzen_incl_btw === undefined) {
      if (!confirm('De btw-status is nog niet gezet. Doorgaan zonder dit (matching kan minder nauwkeurig zijn)?')) return;
    }
    setOpslaan(true);
    try {
      const res = await fetch('/api/tender/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tender: form,
          raw_email: rawEmail,
          portalen: ['hiltermann'],   // start met 1 portaal, rest komt later
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Start mislukt: ' + (data.error ?? 'onbekend'));
        setOpslaan(false);
        return;
      }
      alert(`✓ Tender gestart!\n\nTender ID: ${data.tender_id}\n\nDe Hiltermann-agent draait nu. Check de tender_results-tabel in Supabase, of refresh de inbox.`);
      onReset();
    } catch (e) {
      alert('Netwerkfout: ' + (e as Error).message);
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.sub}>LAB · Lease tender</div>
            <div className={styles.titel}>Bevestig aanvraag</div>
          </div>
          <button className={styles.sluit} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.body}>
          {/* Klant */}
          <Sectie titel="Klant">
            <Twee>
              <Veld label="Naam">
                <input className="fi" value={form.naam} onChange={(e) => stel('naam', e.target.value)} />
              </Veld>
              <Veld label="E-mail">
                <input className="fi" value={form.email ?? ''} onChange={(e) => stel('email', e.target.value)} />
              </Veld>
            </Twee>
          </Sectie>

          {/* Auto */}
          <Sectie titel="Auto">
            <Twee>
              <Veld label="Merk">
                <input className="fi" value={form.merk} onChange={(e) => stel('merk', e.target.value)} />
              </Veld>
              <Veld label="Model">
                <input className="fi" value={form.model} onChange={(e) => stel('model', e.target.value)} />
              </Veld>
            </Twee>
            <Twee>
              <Veld label="Uitvoering">
                <input className="fi" value={form.uitvoering ?? ''} onChange={(e) => stel('uitvoering', e.target.value)} />
              </Veld>
              <Veld label="Brandstof">
                <input className="fi" value={form.brandstof ?? ''} onChange={(e) => stel('brandstof', e.target.value)} />
              </Veld>
            </Twee>
            <Twee>
              <Veld label="Kleur">
                <input className="fi" value={form.kleur ?? ''} onChange={(e) => stel('kleur', e.target.value)} />
              </Veld>
              <Veld label="Bekleding">
                <input className="fi" value={form.bekleding ?? ''} onChange={(e) => stel('bekleding', e.target.value)} />
              </Veld>
            </Twee>
          </Sectie>

          {/* Lease */}
          <Sectie titel="Lease">
            <Twee>
              <Veld label="Looptijd (mnd)">
                <input className="fi" type="number" value={form.looptijd} onChange={(e) => stel('looptijd', parseInt(e.target.value) || 0)} />
              </Veld>
              <Veld label="Km/jaar">
                <input className="fi" type="number" value={form.km_jaar} onChange={(e) => stel('km_jaar', parseInt(e.target.value) || 0)} />
              </Veld>
            </Twee>
          </Sectie>

          {/* Norm */}
          <Sectie titel="Leasenorm">
            <Twee>
              <Veld label="Categorie">
                <input className="fi" value={form.leasenorm.categorie ?? ''} onChange={(e) => stelNorm('categorie', e.target.value)} />
              </Veld>
              <Veld label="Winterbanden">
                <select className="fi" value={form.leasenorm.winterbanden ?? ''} onChange={(e) => stelNorm('winterbanden', e.target.value as LeasenormConfig['winterbanden'])}>
                  <option value="">—</option>
                  <option value="all_season">All season</option>
                  <option value="winter_zomer">Winter + zomer</option>
                  <option value="zomer">Alleen zomer</option>
                </select>
              </Veld>
            </Twee>
            <Twee>
              <Veld label="Vervangend vervoer">
                <select className="fi" value={form.leasenorm.vervangend_vervoer ?? ''} onChange={(e) => stelNorm('vervangend_vervoer', e.target.value as LeasenormConfig['vervangend_vervoer'])}>
                  <option value="">—</option>
                  <option value="24u">Binnen 24u</option>
                  <option value="direct">Direct</option>
                  <option value="geen">Geen</option>
                </select>
              </Veld>
              <Veld label="Eigen risico">
                <select className="fi" value={form.leasenorm.eigen_risico ?? ''} onChange={(e) => stelNorm('eigen_risico', e.target.value as LeasenormConfig['eigen_risico'])}>
                  <option value="">—</option>
                  <option value="laag">Laag</option>
                  <option value="middel">Middel</option>
                  <option value="hoog">Hoog</option>
                </select>
              </Veld>
            </Twee>
          </Sectie>

          {/* Opties */}
          <Sectie titel={`Opties (${form.opties.length})${form.opties.some(o => o.prijs) ? ` · Totaal € ${fmtEuro(form.opties.reduce((s, o) => s + (o.prijs ?? 0), 0))} ${form.prijzen_incl_btw === false ? 'ex' : form.prijzen_incl_btw === true ? 'incl' : '(btw ?)'} btw` : ''}`}>
            {/* BTW indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Prijzen zijn:</span>
              <select
                className="fi"
                style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                value={form.prijzen_incl_btw === true ? 'incl' : form.prijzen_incl_btw === false ? 'excl' : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  stel('prijzen_incl_btw', v === 'incl' ? true : v === 'excl' ? false : undefined);
                }}
              >
                <option value="">— onbekend —</option>
                <option value="incl">Inclusief btw</option>
                <option value="excl">Exclusief btw (+21%)</option>
              </select>
              {form.prijzen_incl_btw === undefined && (
                <span style={{ fontSize: 11, color: '#b45309' }}>⚠ Selecteer om nauwkeurig te matchen</span>
              )}
            </div>
            {form.opties.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>Geen opties uit Groq.</div>
            )}
            {form.opties.map((o, i) => (
              <div key={i} className={styles.optieRij}>
                <input
                  className="fi"
                  style={{ flex: 1, minWidth: 0 }}
                  value={o.naam}
                  onChange={(e) => updateOptie(i, { ...o, naam: e.target.value })}
                  placeholder="Naam optie"
                />
                <div className={styles.prijsWrap}>
                  <span className={styles.prijsPfx}>€</span>
                  <input
                    className="fi"
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ width: 90, paddingLeft: 22 }}
                    value={o.prijs ?? ''}
                    onChange={(e) => updateOptie(i, { ...o, prijs: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="—"
                    title="Prijs (voor matching tussen portalen)"
                  />
                </div>
                <select
                  className="fi"
                  style={{ width: 110 }}
                  value={o.type ?? 'optie'}
                  onChange={(e) => updateOptie(i, { ...o, type: e.target.value as OptieItem['type'] })}
                >
                  <option value="optie">Optie</option>
                  <option value="accessoire">Accessoire</option>
                  <option value="pakket">Pakket</option>
                </select>
                <button className={styles.verwijderKnop} onClick={() => verwijderOptie(i)} title="Verwijder">×</button>
              </div>
            ))}
            <button className="btn" onClick={voegOptieToe} style={{ marginTop: 6 }}>+ Optie toevoegen</button>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>
              💡 Prijzen worden gebruikt als &quot;fingerprint&quot; voor optie-matching tussen portalen
              (bijv. &quot;privacy glass&quot; vs &quot;getinte ramen&quot; — zelfde prijs = waarschijnlijk dezelfde optie).
            </p>
          </Sectie>

          {/* Portalen */}
          <Sectie titel="Portalen">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PORTALEN.map((p) => (
                <span key={p.key} className={styles.portaalChip}>✓ {p.label}</span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              In fase 2 worden alle 5 portalen parallel bevraagd via Stagehand/Browserbase.
            </p>
          </Sectie>

          {/* Originele mail (collapsable) */}
          <details className={styles.details}>
            <summary>Originele mail tonen</summary>
            <pre className={styles.rawEmail}>{rawEmail}</pre>
          </details>
        </div>

        <div className={styles.footer}>
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          <button className="btn btn-a" onClick={startVergelijking} disabled={opslaan}>
            {opslaan ? 'Bezig...' : 'Start vergelijking →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── kleine helpers ──────────────────────────────────────────
function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className={styles.sectie}>
      <div className={styles.sectieKop}>{titel}</div>
      <div className={styles.sectieBody}>{children}</div>
    </section>
  );
}
function Twee({ children }: { children: React.ReactNode }) {
  return <div className={styles.twee}>{children}</div>;
}
function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.veld}>
      <label>{label}</label>
      {children}
    </div>
  );
}
