'use client';

import { useState, useEffect } from 'react';
import { WIE_KEY, WIE_DEFAULT } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { Medewerker } from '@/hooks/useMedewerkers';
import { usePartnerLijst } from '@/hooks/usePartnerLijst';
import styles from './InstellingenPage.module.css';

// ── Herbruikbare popup ────────────────────────────────────────────────────────
function Modal({ titel, sub, onSluiten, children }: { titel: string; sub?: string; onSluiten: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onSluiten}
      style={{ position: 'fixed', inset: 0, background: 'rgba(21,28,39,0.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 16px 48px rgba(21,28,39,0.18)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{titel}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onSluiten} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Wie maakt klaar (centraal in Supabase) ────────────────────────────────────
function PartnersBeheer() {
  const { partners, namen, laden, voegToe, hernoem, verwijder, zetEmail } = usePartnerLijst();
  const [nieuw, setNieuw] = useState('');
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [bewerkenWaarde, setBewerkenWaarde] = useState('');
  const [opgeslagen, setOpgeslagen] = useState(false);

  // Login-popup (rijklaar-portaal account voor een partner)
  const [loginVoor, setLoginVoor] = useState<{ id: string; naam: string; email?: string | null } | null>(null);
  const [lWie, setLWie] = useState('');
  const [lEmail, setLEmail] = useState('');
  const [lWachtwoord, setLWachtwoord] = useState('');
  const [lBezig, setLBezig] = useState(false);
  const [lMelding, setLMelding] = useState<{ type: 'ok' | 'fout'; tekst: string } | null>(null);

  function flash() {
    setOpgeslagen(true);
    setTimeout(() => setOpgeslagen(false), 1800);
  }

  function openLogin(p: { id: string; naam: string; email?: string | null }) {
    setLoginVoor(p);
    setLWie(p.naam.toUpperCase());
    setLEmail(p.email ?? '');
    setLWachtwoord('');
    setLMelding(null);
  }

  async function doeLogin() {
    if (!loginVoor || !lWie.trim() || !lWachtwoord.trim()) return;
    setLBezig(true);
    setLMelding(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/partner-aanmaken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        naam: loginVoor.naam,
        wie: lWie.trim(),
        email: lEmail.trim() || undefined,
        wachtwoord: lWachtwoord.trim(),
      }),
    });
    const data = await res.json();
    setLBezig(false);
    if (!res.ok) {
      setLMelding({ type: 'fout', tekst: data.error ?? 'Onbekende fout' });
    } else {
      setLMelding({ type: 'ok', tekst: `Login gereed: ${data.email}` });
      setTimeout(() => setLoginVoor(null), 1400);
    }
  }

  async function doeToevoegen() {
    const { error } = await voegToe(nieuw);
    if (error) { alert(error); return; }
    setNieuw('');
    flash();
  }

  async function doeHernoemen(id: string) {
    const { error } = await hernoem(id, bewerkenWaarde);
    if (error) { alert(error); return; }
    setBewerkenId(null);
    flash();
  }

  async function doeVerwijderen(id: string, naam: string) {
    if (!confirm(`Verwijder "${naam}" uit de partner-lijst?`)) return;
    const { error } = await verwijder(id);
    if (error) { alert(error); return; }
    flash();
  }

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>🤝</span>
        <div style={{ flex: 1 }}>
          <div className={styles.kaartTitel}>Partners</div>
          <div className={styles.kaartSub}>
            Externe bedrijven die auto&apos;s rijklaar maken — met e-mail voor notificaties en optionele eigen inlog (rijklaar-portaal)
          </div>
        </div>
        {opgeslagen && <span className={styles.savedBadge}>✓ Opgeslagen</span>}
      </div>
      <div className={styles.lijst}>
        {laden ? (
          <div className={styles.leeg}>Laden…</div>
        ) : partners.length === 0 ? (
          <div className={styles.leeg}>Geen partners — voeg er een toe</div>
        ) : (
          partners.map((p) => (
            <div key={p.id} className={styles.rij}>
              {bewerkenId === p.id ? (
                <>
                  <input
                    className={styles.bewerkenInput}
                    value={bewerkenWaarde}
                    onChange={(e) => setBewerkenWaarde(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') doeHernoemen(p.id);
                      if (e.key === 'Escape') setBewerkenId(null);
                    }}
                    autoFocus
                  />
                  <button className={styles.opslaanKnop} onClick={() => doeHernoemen(p.id)}>Opslaan</button>
                  <button className={styles.annuleerKnop} onClick={() => setBewerkenId(null)}>✕</button>
                </>
              ) : (
                <>
                  <span className={styles.naam} style={{ minWidth: 140 }}>{p.naam}</span>
                  <input
                    className={styles.input}
                    type="email"
                    style={{ flex: 1, margin: 0 }}
                    placeholder="E-mail voor notificaties..."
                    defaultValue={p.email ?? ''}
                    onBlur={async (e) => {
                      if ((e.target.value.trim() || null) === (p.email ?? null)) return;
                      const { error } = await zetEmail(p.id, e.target.value);
                      if (error) { alert(error); return; }
                      flash();
                    }}
                  />
                  <div className={styles.acties}>
                    <button
                      className="btn"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => openLogin(p)}
                    >Login</button>
                    <button
                      className={styles.bewerkKnop}
                      onClick={() => { setBewerkenId(p.id); setBewerkenWaarde(p.naam); }}
                    >✎</button>
                    <button
                      className={styles.verwijderKnop}
                      onClick={() => doeVerwijderen(p.id, p.naam)}
                    >✕</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className={styles.toevoegRij}>
        <input
          className={styles.input}
          placeholder="Naam bedrijf of persoon..."
          value={nieuw}
          onChange={(e) => setNieuw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doeToevoegen(); }}
        />
        <button className={styles.toevoegKnop} onClick={doeToevoegen} disabled={!nieuw.trim()}>
          + Toevoegen
        </button>
      </div>
      {/* Helper-tekst */}
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 14px 0' }}>
        💡 Beschikbare namen voor &quot;Partners toewijzen&quot; in After Sales: {namen.join(', ')}
      </p>

      {loginVoor && (
        <Modal
          titel={`Login voor ${loginVoor.naam}`}
          sub="Rijklaar-portaal account aanmaken of wachtwoord resetten"
          onSluiten={() => setLoginVoor(null)}
        >
          <label className={styles.emailLabel}>Wie-koppeling (welke partner-naam in After Sales)</label>
          <input
            className={styles.toevoegInput}
            value={lWie}
            onChange={e => setLWie(e.target.value.toUpperCase())}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <label className={styles.emailLabel}>E-mailadres (inlognaam)</label>
          <input
            className={styles.toevoegInput}
            type="email"
            placeholder="leeg = voornaam@pepewagenparkbeheer.nl"
            value={lEmail}
            onChange={e => setLEmail(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <label className={styles.emailLabel}>Wachtwoord</label>
          <input
            className={styles.toevoegInput}
            type="text"
            placeholder="Wachtwoord voor de partner..."
            value={lWachtwoord}
            onChange={e => setLWachtwoord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doeLogin(); }}
            style={{ width: '100%', marginBottom: 12 }}
          />
          {lMelding && (
            <div className={`${styles.melding} ${lMelding.type === 'fout' ? styles.meldingFout : styles.meldingOk}`} style={{ marginBottom: 12 }}>
              {lMelding.tekst}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setLoginVoor(null)} disabled={lBezig}>Annuleren</button>
            <button className="btn btn-a" onClick={doeLogin} disabled={lBezig || !lWie.trim() || !lWachtwoord.trim()}>
              {lBezig ? 'Bezig...' : 'Login opslaan'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Wie rijklaar (localStorage) ───────────────────────────────────────────────
function leesLijst(key: string, defaults: string[]): string[] {
  if (typeof window === 'undefined') return defaults;
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : defaults; } catch { return defaults; }
}

interface LijstBeheerProps {
  titel: string;
  sub: string;
  icon: string;
  storageKey: string;
  defaults: string[];
  placeholder: string;
}

function LijstBeheer({ titel, sub, icon, storageKey, defaults, placeholder }: LijstBeheerProps) {
  const [lijst, setLijst] = useState<string[]>([]);
  const [nieuw, setNieuw] = useState('');
  const [bewerkenIdx, setBewerkenIdx] = useState<number | null>(null);
  const [bewerkenWaarde, setBewerkenWaarde] = useState('');
  const [opgeslagen, setOpgeslagen] = useState(false);

  useEffect(() => { setLijst(leesLijst(storageKey, defaults)); }, [storageKey]);

  function slaOp(items: string[]) {
    setLijst(items);
    localStorage.setItem(storageKey, JSON.stringify(items));
    setOpgeslagen(true);
    setTimeout(() => setOpgeslagen(false), 2000);
  }

  function voegToe() {
    const naam = nieuw.trim();
    if (!naam || lijst.map(n => n.toLowerCase()).includes(naam.toLowerCase())) return;
    slaOp([...lijst, naam]);
    setNieuw('');
  }

  function verwijder(idx: number) { slaOp(lijst.filter((_, i) => i !== idx)); }

  function startBewerken(idx: number) {
    setBewerkenIdx(idx);
    setBewerkenWaarde(lijst[idx]);
  }

  function slaBewerkenOp(idx: number) {
    const naam = bewerkenWaarde.trim();
    if (!naam) return;
    const n = [...lijst]; n[idx] = naam;
    slaOp(n); setBewerkenIdx(null);
  }

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div className={styles.kaartTitel}>{titel}</div>
          <div className={styles.kaartSub}>{sub}</div>
        </div>
        {opgeslagen && <span className={styles.savedBadge}>✓ Opgeslagen</span>}
      </div>
      <div className={styles.lijst}>
        {lijst.length === 0 && <div className={styles.leeg}>Nog niets toegevoegd</div>}
        {lijst.map((naam, idx) => (
          <div key={idx} className={styles.rij}>
            {bewerkenIdx === idx ? (
              <>
                <input className={styles.bewerkenInput} value={bewerkenWaarde}
                  onChange={e => setBewerkenWaarde(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') slaBewerkenOp(idx); if (e.key === 'Escape') setBewerkenIdx(null); }}
                  autoFocus />
                <button className={styles.opslaanKnop} onClick={() => slaBewerkenOp(idx)}>Opslaan</button>
                <button className={styles.annuleerKnop} onClick={() => setBewerkenIdx(null)}>✕</button>
              </>
            ) : (
              <>
                <span className={styles.naam}>{naam}</span>
                <div className={styles.acties}>
                  <button className={styles.bewerkKnop} onClick={() => startBewerken(idx)}>✎</button>
                  <button className={styles.verwijderKnop} onClick={() => verwijder(idx)}>✕</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className={styles.toevoegRij}>
        <input className={styles.toevoegInput} placeholder={placeholder} value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') voegToe(); }} />
        <button className={styles.toevoegKnop} onClick={voegToe} disabled={!nieuw.trim()}>+ Toevoegen</button>
      </div>
    </div>
  );
}

// ── Medewerkers (Supabase) ────────────────────────────────────────────────────
function MedewerkersBeheer() {
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([]);
  const [laden, setLaden] = useState(true);
  const [nieuwNaam, setNieuwNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ type: 'ok' | 'fout'; tekst: string } | null>(null);

  useEffect(() => { laadMedewerkers(); }, []);

  async function laadMedewerkers() {
    setLaden(true);
    const { data } = await supabase.from('medewerkers').select('id, naam, email, actief').order('naam');
    setMedewerkers(data ?? []);
    setLaden(false);
  }

  function emailVoorNaam(naam: string) {
    return `${naam.trim().split(/\s+/)[0].toLowerCase()}@pepewagenparkbeheer.nl`;
  }

  async function voegToe() {
    const naam = nieuwNaam.trim();
    if (!naam) return;
    setBezig(true);
    setMelding(null);

    const { data: { session } } = await import('@/lib/supabase').then(m => m.supabase.auth.getSession());
    const res = await fetch('/api/medewerker-aanmaken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ naam }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMelding({ type: 'fout', tekst: data.error ?? 'Onbekende fout' });
    } else {
      const tekst = data.bestaatAl
        ? `${data.email} bestond al — wachtwoord gereset naar ${data.wachtwoord}`
        : `${data.email} aangemaakt — wachtwoord: ${data.wachtwoord} (zelf te wijzigen via Instellingen)`;
      setMelding({ type: 'ok', tekst });
      setNieuwNaam('');
      await laadMedewerkers();
    }
    setBezig(false);
    setTimeout(() => setMelding(null), 5000);
  }

  async function toggleActief(m: Medewerker) {
    await supabase.from('medewerkers').update({ actief: !m.actief }).eq('id', m.id);
    setMedewerkers(prev => prev.map(x => x.id === m.id ? { ...x, actief: !x.actief } : x));
  }

  const voornaam = nieuwNaam.trim().split(/\s+/)[0].toLowerCase();
  const emailPreview = voornaam ? emailVoorNaam(nieuwNaam) : '';

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>👤</span>
        <div>
          <div className={styles.kaartTitel}>Medewerkers</div>
          <div className={styles.kaartSub}>Login + dropdowns "Wie levert af", inkoper, verkoper</div>
        </div>
      </div>

      <div className={styles.lijst}>
        {laden && <div className={styles.leeg}>Laden...</div>}
        {!laden && medewerkers.length === 0 && <div className={styles.leeg}>Nog geen medewerkers</div>}
        {medewerkers.map((m) => (
          <div key={m.id} className={`${styles.rij} ${!m.actief ? styles.inactief : ''}`}>
            <div className={styles.medewerkersInfo}>
              <span className={styles.naam}>{m.naam}</span>
              <span className={styles.emailLabel}>{m.email}</span>
            </div>
            <div className={styles.acties} style={{ opacity: 1 }}>
              <button
                className={m.actief ? styles.deactiveerKnop : styles.activeerKnop}
                onClick={() => toggleActief(m)}
                title={m.actief ? 'Deactiveren' : 'Activeren'}
              >
                {m.actief ? 'Deactiveren' : 'Activeren'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.toevoegBlok}>
        <div className={styles.toevoegRij}>
          <input
            className={styles.toevoegInput}
            placeholder="Voornaam (of volledige naam)..."
            value={nieuwNaam}
            onChange={e => setNieuwNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') voegToe(); }}
            disabled={bezig}
          />
          <button className={styles.toevoegKnop} onClick={voegToe} disabled={!nieuwNaam.trim() || bezig}>
            {bezig ? 'Bezig...' : '+ Uitnodigen'}
          </button>
        </div>
        {emailPreview && (
          <div className={styles.emailPreview}>
            Uitnodiging wordt verstuurd naar <strong>{emailPreview}</strong>
          </div>
        )}
        {melding && (
          <div className={`${styles.melding} ${melding.type === 'fout' ? styles.meldingFout : styles.meldingOk}`}>
            {melding.tekst}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TransConnect webhook ──────────────────────────────────────────────────────
function TransConnectBeheer() {
  const [status, setStatus] = useState<'idle' | 'bezig' | 'ok' | 'fout'>('idle');
  const [melding, setMelding] = useState('');

  async function registreer() {
    setStatus('bezig');
    setMelding('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/transconnect/register-webhook', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('fout');
        setMelding(data.error ?? `Fout ${res.status}`);
      } else {
        setStatus('ok');
        setMelding(`Webhook geregistreerd: ${data.callbackUrl}`);
      }
    } catch (e) {
      setStatus('fout');
      setMelding(String(e));
    }
  }

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>🚗</span>
        <div style={{ flex: 1 }}>
          <div className={styles.kaartTitel}>TransConnect</div>
          <div className={styles.kaartSub}>Eenmalig webhook registreren zodat transport-updates automatisch binnenkomen</div>
        </div>
      </div>
      <div style={{ padding: '12px 0 4px' }}>
        <button
          className={styles.toevoegKnop}
          onClick={registreer}
          disabled={status === 'bezig' || status === 'ok'}
        >
          {status === 'bezig' ? 'Bezig...' : status === 'ok' ? '✓ Geregistreerd' : 'Webhook registreren'}
        </button>
        {melding && (
          <div className={`${styles.melding} ${status === 'fout' ? styles.meldingFout : styles.meldingOk}`}
            style={{ marginTop: 10 }}>
            {melding}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Partners (rijklaar-bedrijven) ─────────────────────────────────────────────
// ── Mijn wachtwoord (self-service) ────────────────────────────────────────────
function MijnWachtwoord() {
  const [open, setOpen] = useState(false);
  const [nieuw, setNieuw] = useState('');
  const [herhaal, setHerhaal] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ type: 'ok' | 'fout'; tekst: string } | null>(null);

  function sluit() {
    setOpen(false);
    setNieuw('');
    setHerhaal('');
    setMelding(null);
  }

  async function opslaan() {
    if (nieuw.length < 6) {
      setMelding({ type: 'fout', tekst: 'Minimaal 6 tekens' });
      return;
    }
    if (nieuw !== herhaal) {
      setMelding({ type: 'fout', tekst: 'Wachtwoorden komen niet overeen' });
      return;
    }
    setBezig(true);
    setMelding(null);
    const { error } = await supabase.auth.updateUser({ password: nieuw });
    setBezig(false);
    if (error) {
      setMelding({ type: 'fout', tekst: error.message });
    } else {
      setMelding({ type: 'ok', tekst: 'Wachtwoord gewijzigd ✓' });
      setTimeout(sluit, 1200);
    }
  }

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>🔑</span>
        <div>
          <div className={styles.kaartTitel}>Mijn wachtwoord</div>
          <div className={styles.kaartSub}>Wijzig je eigen inlogwachtwoord</div>
        </div>
      </div>
      <div className={styles.toevoegBlok}>
        <button className="btn btn-a" onClick={() => setOpen(true)}>Wachtwoord wijzigen</button>
      </div>

      {open && (
        <Modal titel="Wachtwoord wijzigen" sub="Minimaal 6 tekens" onSluiten={sluit}>
          <input
            className={styles.toevoegInput}
            type="password"
            placeholder="Nieuw wachtwoord..."
            value={nieuw}
            onChange={e => setNieuw(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
            autoFocus
          />
          <input
            className={styles.toevoegInput}
            type="password"
            placeholder="Herhaal wachtwoord..."
            value={herhaal}
            onChange={e => setHerhaal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') opslaan(); }}
            style={{ width: '100%', marginBottom: 12 }}
          />
          {melding && (
            <div className={`${styles.melding} ${melding.type === 'fout' ? styles.meldingFout : styles.meldingOk}`} style={{ marginBottom: 12 }}>
              {melding.tekst}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={sluit} disabled={bezig}>Annuleren</button>
            <button className="btn btn-a" onClick={opslaan} disabled={bezig || !nieuw || !herhaal}>
              {bezig ? 'Bezig...' : 'Opslaan'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function InstellingenPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.titel}>Instellingen</h1>
      </div>

      <div className={styles.grid}>
        <MijnWachtwoord />
        <MedewerkersBeheer />
        <PartnersBeheer />
        <TransConnectBeheer />
      </div>
    </div>
  );
}
