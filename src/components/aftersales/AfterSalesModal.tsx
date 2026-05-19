'use client';

import { useEffect, useState } from 'react';
import type { AfterSalesAuto, ASAutoType } from '@/types';
import { MERKEN_LIJST, WIE_KEY, WIE_DEFAULT } from '@/lib/constants';
import { useMedewerkers } from '@/hooks/useMedewerkers';
import { useInname } from '@/hooks/useInname';
import InnameDetailModal from './InnameDetailModal';

function leesWie(): string[] {
  if (typeof window === 'undefined') return WIE_DEFAULT;
  try { const s = localStorage.getItem(WIE_KEY); return s ? JSON.parse(s) : WIE_DEFAULT; } catch { return WIE_DEFAULT; }
}
import styles from './AfterSalesPage.module.css';

const ACC_TAGS = ['Alarm', 'Alarm keuren', 'Voertuigvolg', 'Trekhaak', 'Matten'];

const PLATEN_OPTIES = ['— onbekend / NVT —', 'Besteld', 'Ontvangen', 'Gemonteerd'];

const TYPE_OPTIES: { k: ASAutoType; l: string }[] = [
  { k: 'import', l: '🌍 Import' },
  { k: 'nl', l: '🇳🇱 Nederlands' },
  { k: 'nieuw', l: '✨ Nieuw' },
  { k: 'voorraad', l: '🏢 Voorraad' },
];

const LEEG: Omit<AfterSalesAuto, 'id' | 'created_at'> = {
  kenteken: '', merk: '', model: '', klant: '', email_klant: '', type: 'nl',
  platen: '', wie_levert_af: '', wie_rijklaar: '', klaarmaker_naam: '',
  afleverdatum: '', tijdstip_levering: '', transportdatum: '', binnen_op: '',
  notitie: '', accessoires: '', extra_accessoires: '', btw_credit: false,
};

interface Props {
  record: AfterSalesAuto | null;
  open: boolean;
  onSluiten: () => void;
  onOpslaan: (rec: AfterSalesAuto | Omit<AfterSalesAuto, 'id' | 'created_at'>) => Promise<void>;
  onVerwijder: (id: string) => Promise<void>;
  onAfleveren?: (rec: AfterSalesAuto) => void;
}

export default function AfterSalesModal({ record, open, onSluiten, onOpslaan, onVerwijder, onAfleveren }: Props) {
  const wieLijst = leesWie();
  const { namen: medewerkers } = useMedewerkers();
  const { latest: inname } = useInname(record?.id);
  const [innameOpen, setInnameOpen] = useState(false);
  const [form, setForm] = useState<Omit<AfterSalesAuto, 'id' | 'created_at'>>(LEEG);
  const [opslaan, setOpslaan] = useState(false);
  const [rdwLaden, setRdwLaden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...LEEG, ...record } : { ...LEEG });
  }, [open, record]);

  function stel<K extends keyof typeof form>(veld: K, waarde: typeof form[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  function toggleAcc(tag: string) {
    const huidig = (form.accessoires ?? '').split(',').filter(Boolean);
    const nieuw = huidig.includes(tag) ? huidig.filter((t) => t !== tag) : [...huidig, tag];
    stel('accessoires', nieuw.join(','));
  }

  function togglePartner(naam: string) {
    const huidig = form.partners_toegewezen ?? [];
    const nieuw = huidig.includes(naam) ? huidig.filter((n) => n !== naam) : [...huidig, naam];
    stel('partners_toegewezen', nieuw);
  }

  const accLijst = (form.accessoires ?? '').split(',').filter(Boolean);

  async function rdwOpzoeken() {
    const kenteken = form.kenteken.replace(/-/g, '').toUpperCase();
    if (kenteken.length < 5) { alert('Vul eerst een kenteken in.'); return; }
    setRdwLaden(true);
    try {
      const res = await fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${kenteken}`);
      const data = await res.json();
      if (!data || data.length === 0) { alert('Geen voertuig gevonden voor dit kenteken.'); return; }
      const auto = data[0];
      setForm((f) => ({
        ...f,
        merk: f.merk || (auto.merk ? auto.merk.charAt(0) + auto.merk.slice(1).toLowerCase() : f.merk),
        model: f.model || (auto.handelsbenaming ?? f.model),
        apk: f.apk || (auto.vervaldatum_apk
          ? `${auto.vervaldatum_apk.slice(6, 8)}-${auto.vervaldatum_apk.slice(4, 6)}-${auto.vervaldatum_apk.slice(0, 4)}`
          : f.apk),
      }));
    } catch {
      alert('RDW ophalen mislukt. Controleer je internetverbinding.');
    } finally {
      setRdwLaden(false);
    }
  }

  async function handleOpslaan() {
    if (!form.kenteken) { alert('Vul een kenteken in.'); return; }
    setOpslaan(true);
    if (record) await onOpslaan({ ...form, id: record.id, created_at: record.created_at });
    else await onOpslaan(form);
    setOpslaan(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!record) return;
    if (!confirm('Zeker verwijderen?')) return;
    await onVerwijder(record.id);
    onSluiten();
  }

  if (!open) return null;

  if (innameOpen && inname) {
    return <InnameDetailModal inname={inname} onSluiten={() => setInnameOpen(false)} />;
  }

  const isImport = form.type === 'import';

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {record ? `${record.kenteken} — ${record.merk ?? ''} ${record.model ?? ''}`.trim() : 'Auto toevoegen — After Sales'}
          </div>
          <button className={styles.sluitKnop} onClick={onSluiten}>×</button>
        </div>

        <div className={styles.modalBody}>

          {/* ── AUTO GEGEVENS ── */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Kenteken / Meldcode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="fi"
                placeholder="bijv. AB-123-C of laatste 4 chassis"
                value={form.kenteken}
                onChange={(e) => stel('kenteken', e.target.value.toUpperCase())}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#60a5fa', borderColor: 'rgba(96,165,250,.3)' }}
                onClick={rdwOpzoeken}
                disabled={rdwLaden}
              >
                {rdwLaden ? '...' : '🔵 RDW'}
              </button>
            </div>
          </div>

          <div className={styles.fg}>
            <label>Type auto</label>
            <select className="fi" value={form.type ?? 'nl'} onChange={(e) => stel('type', e.target.value as ASAutoType)}>
              {TYPE_OPTIES.map(({ k, l }) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Merk</label>
            <select className="fi" value={form.merk ?? ''} onChange={(e) => stel('merk', e.target.value)}>
              <option value="">— kies merk —</option>
              {MERKEN_LIJST.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Model</label>
            <input className="fi" placeholder="bijv. Q5, A6, EV3..." value={form.model ?? ''} onChange={(e) => stel('model', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Kentekenplaten</label>
            <select className="fi" value={form.platen ?? ''} onChange={(e) => stel('platen', e.target.value)}>
              {PLATEN_OPTIES.map((o) => <option key={o} value={o === PLATEN_OPTIES[0] ? '' : o}>{o}</option>)}
            </select>
          </div>

          {isImport && (
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Transportdatum</label>
              <input className="fi" type="date" value={form.transportdatum ?? ''} onChange={(e) => stel('transportdatum', e.target.value)} />
            </div>
          )}

          <div className={styles.fg}>
            <label>Datum binnenkomst</label>
            <input className="fi" type="date" value={form.binnen_op ?? ''} onChange={(e) => stel('binnen_op', e.target.value)} />
          </div>

          {/* ── KLANT GEGEVENS ── */}
          <div className={styles.sectieHdr}>Klant gegevens</div>

          <div className={styles.fg}>
            <label>Klant naam</label>
            <input className="fi" placeholder="Voornaam Achternaam" value={form.klant ?? ''} onChange={(e) => stel('klant', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>E-mail klant</label>
            <input className="fi" type="email" placeholder="klant@email.nl" value={form.email_klant ?? ''} onChange={(e) => stel('email_klant', e.target.value)} />
          </div>

          {/* ── WIE MAAKT KLAAR ── */}
          <div className={styles.sectieHdr}>Wie maakt klaar</div>

          <div className={styles.fg}>
            <label>Wie maakt klaar</label>
            <select className="fi" value={form.wie_rijklaar ?? ''} onChange={(e) => stel('wie_rijklaar', e.target.value)}>
              <option value="">— kies —</option>
              {wieLijst.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Klaarmaker naam (vrij invullen)</label>
            <input className="fi" placeholder="Naam garage/persoon" value={form.klaarmaker_naam ?? ''} onChange={(e) => stel('klaarmaker_naam', e.target.value)} />
          </div>

          {/* ── PARTNERS TOEWIJZEN ── */}
          {wieLijst.length > 0 && (
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Partners toewijzen</label>
              <div className={styles.typeGrid}>
                {wieLijst.map((naam) => {
                  const aan = (form.partners_toegewezen ?? []).includes(naam);
                  const klaar = (form.partners_klaar ?? []).includes(naam);
                  return (
                    <button
                      key={naam}
                      type="button"
                      className={`${styles.typeBtn} ${aan ? styles.actief : ''}`}
                      onClick={() => togglePartner(naam)}
                      style={klaar ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
                      title={klaar ? `${naam} heeft klaar gemeld` : aan ? `${naam} verwijderen` : `${naam} toewijzen`}
                    >
                      {klaar ? '✓ ' : ''}{naam}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PARTNER UPDATES ── */}
          {(form.wie_rijklaar || (form.partner_updates ?? []).length > 0) && (
            <>
              <div className={styles.sectieHdr}>Partner — {form.wie_rijklaar || '—'}</div>
              <div className={`${styles.fg} ${styles.vol}`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                  {/* Binnen bij partner */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: form.partner_binnen ? 'rgba(82,196,126,0.15)' : 'var(--bg)',
                    color: form.partner_binnen ? 'var(--green)' : 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}>
                    {form.partner_binnen ? '📍 Staat bij partner' : 'Nog niet bij partner'}
                    {form.partner_binnen && form.partner_binnen_op && (() => {
                      const dagen = Math.floor((Date.now() - new Date(form.partner_binnen_op!).getTime()) / 86400000);
                      return <span style={{ opacity: 0.7 }}>· {dagen === 0 ? 'vandaag' : `${dagen}d`}</span>;
                    })()}
                  </span>
                  {/* Ingepland */}
                  {form.partner_datum && (
                    <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: 'rgba(82,196,126,0.1)', border: '1px solid var(--border)' }}>
                      📅 Ingepland: {new Date(form.partner_datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                  )}
                  {/* Onderdelen */}
                  {form.partner_onderdelen_besteld && (
                    <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: 'rgba(82,196,126,0.1)', border: '1px solid var(--border)' }}>
                      ✓ Onderdelen besteld
                    </span>
                  )}
                </div>
                {/* Updates feed */}
                {(form.partner_updates ?? []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {(form.partner_updates ?? []).map((u, i) => (
                      <div key={i} style={{ padding: '8px 12px', borderBottom: i < (form.partner_updates ?? []).length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: 13, color: 'var(--text)' }}>{u.tekst}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {new Date(u.op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} · {u.door}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nog geen updates van de partner.</div>
                )}
              </div>
            </>
          )}

          {/* ── ACCESSOIRES ── */}
          <div className={styles.sectieHdr}>Accessoires</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Selecteer accessoires</label>
            <div className={styles.typeGrid}>
              {ACC_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.typeBtn} ${accLijst.includes(tag) ? styles.actief : ''}`}
                  onClick={() => toggleAcc(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Extra accessoires / opmerkingen</label>
            <input className="fi" placeholder="bijv. velgen 18 inch, dashcam..." value={form.extra_accessoires ?? ''} onChange={(e) => stel('extra_accessoires', e.target.value)} />
          </div>

          {/* ── GEPLANDE AFLEVERING ── */}
          <div className={styles.sectieHdr}>Geplande aflevering</div>

          <div className={styles.fg}>
            <label>Geplande leverdatum</label>
            <input className="fi" type="date" value={form.afleverdatum ?? ''} onChange={(e) => stel('afleverdatum', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Tijdstip levering</label>
            <input className="fi" type="time" value={form.tijdstip_levering ?? ''} onChange={(e) => stel('tijdstip_levering', e.target.value)} />
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Wie levert af</label>
            <select className="fi" value={form.wie_levert_af ?? ''} onChange={(e) => stel('wie_levert_af', e.target.value)}>
              <option value="">— kies —</option>
              {medewerkers.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* ── INTERNE NOTITIES ── */}
          <div className={styles.sectieHdr}>Interne notities</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <textarea className="fi" rows={3} placeholder="bijv. staat bij VDU, wacht op onderdeel..." value={form.notitie ?? ''} onChange={(e) => stel('notitie', e.target.value)} />
          </div>

          {/* ── INNAME FORMULIER ── */}
          {inname && (
            <>
              <div className={styles.sectieHdr}>📋 Inname formulier</div>
              <div className={`${styles.fg} ${styles.vol}`}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', justifyContent: 'center', gap: 8 }}
                  onClick={() => setInnameOpen(true)}
                >
                  📋 Bekijk innameformulier ({inname.datum ?? '—'})
                </button>
              </div>
            </>
          )}

          {/* ── BTW / CREDIT ── */}
          <div className={styles.sectieHdr}>BTW / Credit</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'normal', fontSize: 13, textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={!!form.btw_credit}
                onChange={(e) => stel('btw_credit', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              Zet in BTW/Credit overzicht
            </label>
          </div>

        </div>

        <div className={styles.modalFooter}>
          {record && <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>}
          <button className="btn" onClick={onSluiten}>Annuleer</button>
          {record && onAfleveren && (
            <button className={styles.afleverKnop} onClick={() => { onSluiten(); onAfleveren(record); }}>
              ✅ Afleveren
            </button>
          )}
          <button className="btn btn-a" onClick={handleOpslaan} disabled={opslaan}>{opslaan ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
