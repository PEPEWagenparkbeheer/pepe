'use client';

import { useEffect, useState } from 'react';
import type { KlachtUpdate, KlantReactie, Lead, LeadBron, LeadStatus } from '@/types';
import { authHeaders } from '@/lib/clientAuth';
import styles from './LeadsPage.module.css';
import BreinFeedback from '@/components/brein/BreinFeedback';

const LEEG: Omit<Lead, 'id' | 'created_at'> = {
  bron: 'anders',
  klant_naam: '',
  email: '',
  telefoon: '',
  auto: '',
  prijs: '',
  advertentie_url: '',
  bericht: '',
  status: 'nieuw',
  wie: '',
  notities: '',
  vervolgactie: '',
  vervolgdatum: '',
  gearchiveerd: false,
  contactmomenten: [],
};

const MEDEWERKERS = ['Joep', 'Diego', 'Jasper', 'Roger', 'Kevin', 'Lorenzo', 'Perke'];

const BRON_LABELS: Record<LeadBron, string> = {
  autoscout24: '🔴 AutoScout24',
  autowereld:  '🔵 Autowereld',
  marktplaats: '🟠 Marktplaats',
  email:       '✉️ E-mail',
  anders:      '📌 Anders',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  nieuw:          '🔵 Nieuw',
  opgepakt:       '🟠 Opgepakt',
  gebeld:         '🟣 Gebeld',
  interesse:      '🟢 Interesse',
  verkocht:       '✅ Verkocht',
  geen_interesse: '⬜ Geen interesse',
};

function momentTijd(iso: string) {
  try {
    return new Date(iso).toLocaleString('nl-NL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

interface Props {
  lead: Lead | null;
  open: boolean;
  gebruiker: string;
  onSluiten: () => void;
  onOpslaan: (rec: Lead | Omit<Lead, 'id' | 'created_at'>) => Promise<unknown>;
  onVerwijder: (id: string) => Promise<void>;
}

export default function LeadsModal({ lead, open, gebruiker, onSluiten, onOpslaan, onVerwijder }: Props) {
  const [form, setForm] = useState<Omit<Lead, 'id' | 'created_at'>>(LEEG);
  const [bezig, setBezig] = useState(false);
  const [nieuwMoment, setNieuwMoment] = useState('');

  // Voorgestelde reactie (BREIN-concept op de lead)
  const [concept, setConcept] = useState('');
  const [conceptInruil, setConceptInruil] = useState(false);
  const [genereren, setGenereren] = useState(false);
  const [versturen, setVersturen] = useState(false);
  const [expandedMomenten, setExpandedMomenten] = useState<Set<number>>(new Set());
  const [expandedReacties, setExpandedReacties] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setForm(lead ? { ...LEEG, ...lead } : { ...LEEG, wie: gebruiker });
    setNieuwMoment('');
    setConcept(lead?.concept_antwoord ?? '');
    setConceptInruil(lead?.concept_inruil ?? false);

    // Markeer ongelezen klantreacties als gelezen zodra de modal opent.
    if (lead) {
      const reacties = lead.klant_reacties ?? [];
      const heeftOngelezen = reacties.some((r: KlantReactie) => !r.gelezen);
      if (heeftOngelezen) {
        const bijgewerkt = reacties.map((r: KlantReactie) => ({ ...r, gelezen: true }));
        void onOpslaan({ ...lead, klant_reacties: bijgewerkt });
      }
    }
  }, [open, lead, gebruiker]); // eslint-disable-line react-hooks/exhaustive-deps

  function stel<K extends keyof typeof form>(veld: K, waarde: (typeof form)[K]) {
    setForm((f) => ({ ...f, [veld]: waarde }));
  }

  function voegMomentToe() {
    if (!nieuwMoment.trim()) return;
    const moment: KlachtUpdate = {
      tekst: nieuwMoment.trim(),
      op: new Date().toISOString(),
      door: gebruiker || '?',
    };
    stel('contactmomenten', [...(form.contactmomenten ?? []), moment]);
    setNieuwMoment('');
  }

  async function genereerReactie() {
    setGenereren(true);
    try {
      const res = await fetch('/api/leads/concept', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          klant_naam: form.klant_naam, auto: form.auto, prijs: form.prijs,
          advertentie_url: form.advertentie_url, bericht: form.bericht, bron: form.bron,
          klant_reacties: form.klant_reacties ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Genereren mislukt');
      const nieuwConcept = data.body || '';
      const nieuwInruil = !!data.inruil;
      setConcept(nieuwConcept);
      setConceptInruil(nieuwInruil);
      if (lead) {
        await onOpslaan({
          ...lead,
          concept_antwoord: nieuwConcept,
          concept_inruil: nieuwInruil,
        });
      }
    } catch (e) {
      alert('Genereren mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenereren(false);
    }
  }

  async function verstuurReactie() {
    if (!form.email) { alert('Geen e-mailadres bij deze lead.'); return; }
    if (!concept.trim()) { alert('Genereer of schrijf eerst een reactie.'); return; }
    if (!confirm(`Reactie versturen naar ${form.email}?`)) return;
    setVersturen(true);
    try {
      const res = await fetch('/api/leads/send', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          to: form.email, subject: `RE: ${form.auto}`, body: concept,
          inruil: conceptInruil, wie: form.wie || gebruiker, auto: form.auto,
          leadId: lead?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Versturen mislukt');
      const moment: KlachtUpdate = {
        tekst: `Reactie verstuurd naar ${form.email}${conceptInruil ? ' (incl. waardebepaling-PDF)' : ''}`,
        op: new Date().toISOString(),
        door: gebruiker || '?',
        inhoud: concept,
      };
      const nieuw = {
        ...form,
        concept_antwoord: concept,
        concept_inruil: conceptInruil,
        contactmomenten: [...(form.contactmomenten ?? []), moment],
        status: form.status === 'nieuw' ? ('opgepakt' as LeadStatus) : form.status,
      };
      setForm(nieuw);
      if (lead) await onOpslaan({ ...nieuw, id: lead.id, created_at: lead.created_at });
      alert('Reactie verstuurd ✅');
    } catch (e) {
      alert('Versturen mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setVersturen(false);
    }
  }

  async function handleOpslaan() {
    if (!form.klant_naam.trim()) { alert('Vul de klantnaam in.'); return; }
    if (!form.auto.trim()) { alert('Vul de auto in.'); return; }
    setBezig(true);
    const metConcept = { ...form, concept_antwoord: concept, concept_inruil: conceptInruil };
    const opTeSlaan = form.status === 'geen_interesse' ? { ...metConcept, gearchiveerd: true } : metConcept;
    if (lead) {
      await onOpslaan({ ...opTeSlaan, id: lead.id, created_at: lead.created_at });
    } else {
      await onOpslaan(opTeSlaan);
    }
    setBezig(false);
    onSluiten();
  }

  async function handleVerwijder() {
    if (!lead) return;
    if (!confirm('Lead verwijderen?')) return;
    await onVerwijder(lead.id);
    onSluiten();
  }

  async function handleSluiten() {
    // Bewaar het concept ook bij annuleren/sluiten; overige formulierwijzigingen
    // blijven bij Annuleren bewust onopgeslagen.
    if (lead && (
      concept !== (lead.concept_antwoord ?? '') ||
      conceptInruil !== (lead.concept_inruil ?? false)
    )) {
      await onOpslaan({
        ...lead,
        concept_antwoord: concept,
        concept_inruil: conceptInruil,
      });
    }
    onSluiten();
  }

  if (!open) return null;

  const momenten = form.contactmomenten ?? [];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitel}>
            {lead ? `Lead: ${lead.klant_naam}` : '📞 Nieuwe lead'}
          </div>
          <button className={styles.sluitKnop} onClick={() => void handleSluiten()}>×</button>
        </div>

        <div className={styles.modalBody}>

          {/* Klant */}
          <div className={styles.sectieKop}>Klantgegevens</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Naam klant *</label>
            <input className="fi" placeholder="Voornaam Achternaam" value={form.klant_naam}
              onChange={(e) => stel('klant_naam', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>E-mailadres</label>
            <input className="fi" type="email" placeholder="naam@voorbeeld.nl" value={form.email ?? ''}
              onChange={(e) => stel('email', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Telefoonnummer</label>
            <input className="fi" type="tel" placeholder="06-12345678" value={form.telefoon ?? ''}
              onChange={(e) => stel('telefoon', e.target.value)} />
          </div>

          {/* Auto */}
          <div className={styles.sectieKop}>Auto</div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Auto omschrijving *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input className="fi" placeholder="bijv. Audi A4 2.0 TDI" value={form.auto}
                onChange={(e) => stel('auto', e.target.value)} style={{ flex: 1 }} />
              {form.prijs && (
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                  {form.prijs}
                </span>
              )}
            </div>
          </div>

          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Advertentie URL <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optioneel)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="fi" type="url" placeholder="https://..." value={form.advertentie_url ?? ''}
                onChange={(e) => stel('advertentie_url', e.target.value)}
                style={{ flex: 1 }} />
              <a
                className="btn"
                href={form.advertentie_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { if (!form.advertentie_url) e.preventDefault(); }}
                style={{
                  fontSize: 13, padding: '7px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
                  opacity: form.advertentie_url ? 1 : 0.35, pointerEvents: form.advertentie_url ? 'auto' : 'none',
                }}
              >
                🔗 Ga naar advertentie
              </a>
            </div>
          </div>

          {/* Bron */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Bron</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(BRON_LABELS) as LeadBron[]).map((b) => (
                <button key={b} type="button"
                  className={`btn ${form.bron === b ? 'btn-a' : ''}`}
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => stel('bron', b)}
                >
                  {BRON_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className={styles.sectieKop}>Status & opvolging</div>

          <div className={styles.fg}>
            <label>Status</label>
            <select className="fi" value={form.status} onChange={(e) => stel('status', e.target.value as LeadStatus)}>
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Behandeld door (wie)</label>
            <select className="fi" value={form.wie ?? ''} onChange={(e) => stel('wie', e.target.value)}>
              <option value="">— selecteer —</option>
              {MEDEWERKERS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className={styles.fg}>
            <label>Vervolgactie</label>
            <input className="fi" placeholder="bijv. Terugbellen dinsdag" value={form.vervolgactie ?? ''}
              onChange={(e) => stel('vervolgactie', e.target.value)} />
          </div>

          <div className={styles.fg}>
            <label>Vervolgdatum</label>
            <input className="fi" type="date" value={form.vervolgdatum ?? ''}
              onChange={(e) => stel('vervolgdatum', e.target.value)} />
          </div>

          {/* Origineel bericht */}
          {form.bericht && (
            <>
              <div className={styles.sectieKop}>Origineel bericht</div>
              <div className={styles.vol}>
                <div className={styles.berichtBox}>{form.bericht}</div>
              </div>
            </>
          )}

          {/* Klantreacties — inkomende replies van de klant */}
          {(form.klant_reacties ?? []).length > 0 && (
            <>
              <div className={styles.sectieKop}>Reacties van klant</div>
              <div className={styles.vol}>
                <div className={styles.updateLijst}>
                  {(form.klant_reacties as KlantReactie[]).map((r, i) => {
                    // Vind het PEPE-antwoord dat aan deze klantreactie voorafging.
                    const onsAntwoord = (form.contactmomenten ?? [])
                      .filter((m) => m.inhoud && m.op <= r.op)
                      .sort((a, b) => a.op.localeCompare(b.op))
                      .pop();
                    const open = expandedReacties.has(i);
                    return (
                      <div key={i} className={styles.updateRij} style={{ background: '#e8f4fd', borderLeft: '3px solid #2196f3' }}>
                        <div
                          className={styles.updateMeta}
                          style={{ color: '#1565c0', cursor: onsAntwoord ? 'pointer' : undefined, userSelect: 'none' }}
                          onClick={() => onsAntwoord && setExpandedReacties((prev) => {
                            const s = new Set(prev);
                            s.has(i) ? s.delete(i) : s.add(i);
                            return s;
                          })}
                        >
                          📩 {r.naam} · {momentTijd(r.op)}
                          {onsAntwoord && (
                            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600 }}>
                              {open ? '▾ ons antwoord' : '▸ ons antwoord'}
                            </span>
                          )}
                        </div>
                        <div className={styles.updateTekst} style={{ whiteSpace: 'pre-wrap' }}>{r.tekst}</div>
                        {onsAntwoord && open && (
                          <div style={{
                            marginTop: 8, padding: '8px 10px', background: '#fff',
                            border: '1px solid #cfe3f6', borderRadius: 8,
                            fontSize: 12, whiteSpace: 'pre-wrap', color: '#333', lineHeight: 1.5,
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#1565c0', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                              ↩ Door ons verstuurd · {momentTijd(onsAntwoord.op)}
                            </div>
                            {onsAntwoord.inhoud}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Voorgestelde reactie (alleen bij bestaande lead) */}
          {lead && (
            <>
              <div className={styles.sectieKop}>
                {(form.klant_reacties ?? []).length > 0 ? 'Antwoord op klant' : 'Voorgestelde reactie'}
              </div>
              <div className={`${styles.fg} ${styles.vol}`}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn" type="button" onClick={genereerReactie} disabled={genereren || !form.auto}>
                    {genereren ? 'Genereren…' : '✨ Genereer reactie'}
                  </button>
                  {conceptInruil && (
                    <span style={{ fontSize: 12, color: 'green' }}>📎 Inruil — waardebepaling-PDF wordt meegestuurd</span>
                  )}
                </div>
                <textarea className="fi" rows={7}
                  placeholder="Klik op 'Genereer reactie', of typ zelf een antwoord…"
                  value={concept} onChange={(e) => setConcept(e.target.value)} />
                {concept.trim() && (
                  <BreinFeedback
                    key={lead.id}
                    scope="leads"
                    sourceId={lead.id}
                    originalContext={[form.auto, form.bericht].filter(Boolean).join('\n\n')}
                    conceptResponse={concept}
                  />
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-a" type="button" onClick={verstuurReactie}
                    disabled={versturen || !concept.trim() || !form.email}>
                    {versturen ? 'Versturen…' : '📨 Verstuur naar klant'}
                  </button>
                  {!form.email && <span style={{ fontSize: 12, color: '#b00' }}>Geen e-mailadres bij deze lead</span>}
                  {form.email && <span style={{ fontSize: 12, color: '#777' }}>Vanaf info@ naar {form.email}</span>}
                </div>
              </div>
            </>
          )}

          {/* Notities */}
          <div className={`${styles.fg} ${styles.vol}`}>
            <label>Notities</label>
            <textarea className="fi" rows={3} placeholder="Interne aantekeningen..."
              value={form.notities ?? ''} onChange={(e) => stel('notities', e.target.value)} />
          </div>

          {/* Contactmomenten */}
          <div className={styles.sectieKop}>Contactmomenten</div>
          <div className={styles.vol}>
            <div className={styles.updateLijst}>
              {momenten.length === 0 ? (
                <span className={styles.updateLeeg}>Nog geen contactmomenten</span>
              ) : (
                momenten.map((u, i) => (
                  <div key={i} className={styles.updateRij}>
                    <div
                      className={styles.updateMeta}
                      style={u.inhoud ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                      onClick={() => u.inhoud && setExpandedMomenten((prev) => {
                        const s = new Set(prev);
                        s.has(i) ? s.delete(i) : s.add(i);
                        return s;
                      })}
                    >
                      {u.inhoud ? (expandedMomenten.has(i) ? '▾ ' : '▸ ') : ''}{u.door} · {momentTijd(u.op)}
                    </div>
                    <div className={styles.updateTekst}>{u.tekst}</div>
                    {u.inhoud && expandedMomenten.has(i) && (
                      <div style={{
                        marginTop: 6, padding: '8px 10px', background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 8,
                        fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--text)', lineHeight: 1.5,
                      }}>
                        {u.inhoud}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="fi"
                style={{ flex: 1 }}
                placeholder="Noteer contactmoment..."
                value={nieuwMoment}
                onChange={(e) => setNieuwMoment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegMomentToe(); } }}
              />
              <button className="btn" type="button" onClick={voegMomentToe}>+ Toevoegen</button>
            </div>
          </div>

        </div>

        <div className={styles.modalFooter}>
          {lead && (
            <button className={styles.verwijderKnop} onClick={handleVerwijder}>🗑 Verwijder</button>
          )}
          <button className="btn" onClick={() => void handleSluiten()}>Annuleer</button>
          <button className="btn btn-a" onClick={handleOpslaan} disabled={bezig}>
            {bezig ? 'Opslaan...' : lead ? 'Opslaan' : '+ Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
