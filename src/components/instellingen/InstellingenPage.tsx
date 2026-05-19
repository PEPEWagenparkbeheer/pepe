'use client';

import { useState, useEffect } from 'react';
import { WIE_KEY, WIE_DEFAULT } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { Medewerker } from '@/hooks/useMedewerkers';
import styles from './InstellingenPage.module.css';

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
        ? `${data.email} bestond al in Supabase — toegevoegd aan medewerkerslijst`
        : `Uitnodiging verstuurd naar ${data.email}`;
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
function PartnersBeheer() {
  const [partners, setPartners] = useState<{ naam: string; wie: string; email: string }[]>([]);
  const [naam, setNaam] = useState('');
  const [wie, setWie] = useState('');
  const [email, setEmail] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ type: 'ok' | 'fout'; tekst: string } | null>(null);

  async function uitnodigen() {
    if (!naam.trim() || !wie.trim()) return;
    setBezig(true);
    setMelding(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/partner-aanmaken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ naam: naam.trim(), wie: wie.trim(), email: email.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMelding({ type: 'fout', tekst: data.error ?? 'Onbekende fout' });
    } else {
      const tekst = data.bestaatAl
        ? `${data.email} bestond al — uitnodiging opnieuw verstuurd`
        : `Uitnodiging verstuurd naar ${data.email}`;
      setMelding({ type: 'ok', tekst });
      setPartners(prev => [...prev, { naam: naam.trim(), wie: wie.trim().toUpperCase(), email: data.email }]);
      setNaam(''); setWie(''); setEmail('');
    }
    setBezig(false);
    setTimeout(() => setMelding(null), 6000);
  }

  return (
    <div className={styles.kaart}>
      <div className={styles.kaartHeader}>
        <span className={styles.kaartIcon}>🤝</span>
        <div>
          <div className={styles.kaartTitel}>Partners</div>
          <div className={styles.kaartSub}>Externe bedrijven met eigen inlog (rijklaar-portaal)</div>
        </div>
      </div>

      {partners.length > 0 && (
        <div className={styles.lijst}>
          {partners.map((p, i) => (
            <div key={i} className={styles.rij}>
              <div className={styles.medewerkersInfo}>
                <span className={styles.naam}>{p.naam}</span>
                <span className={styles.emailLabel}>{p.email} · {p.wie}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.toevoegBlok}>
        <div className={styles.toevoegRij}>
          <input
            className={styles.toevoegInput}
            placeholder="Naam partner (bijv. Kurdo)..."
            value={naam}
            onChange={e => setNaam(e.target.value)}
            disabled={bezig}
          />
          <input
            className={styles.toevoegInput}
            placeholder="Wie-koppeling (bijv. KURDO)..."
            value={wie}
            onChange={e => setWie(e.target.value)}
            disabled={bezig}
            style={{ maxWidth: 160 }}
          />
        </div>
        <div className={styles.toevoegRij} style={{ marginTop: 6 }}>
          <input
            className={styles.toevoegInput}
            placeholder="E-mailadres (optioneel)..."
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') uitnodigen(); }}
            disabled={bezig}
          />
          <button
            className={styles.toevoegKnop}
            onClick={uitnodigen}
            disabled={!naam.trim() || !wie.trim() || bezig}
          >
            {bezig ? 'Bezig...' : '+ Uitnodigen'}
          </button>
        </div>
        {melding && (
          <div className={`${styles.melding} ${melding.type === 'fout' ? styles.meldingFout : styles.meldingOk}`}>
            {melding.tekst}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────
export default function InstellingenPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.titel}>Instellingen</h1>
      </div>

      <div className={styles.grid}>
        <MedewerkersBeheer />
        <PartnersBeheer />
        <TransConnectBeheer />

        <LijstBeheer
          titel="Wie maakt klaar"
          sub="Externe bedrijven/personen die auto's rijklaar maken"
          icon="🔧"
          storageKey={WIE_KEY}
          defaults={WIE_DEFAULT}
          placeholder="Naam bedrijf of persoon..."
        />

        <div className={styles.kaart}>
          <div className={styles.kaartHeader}>
            <span className={styles.kaartIcon}>📊</span>
            <div>
              <div className={styles.kaartTitel}>Dashboard tegels</div>
              <div className={styles.kaartSub}>Bepaal welke KPI-tegels zichtbaar zijn en in welke volgorde</div>
            </div>
          </div>
          <div className={styles.placeholder}>Binnenkort beschikbaar</div>
        </div>
      </div>
    </div>
  );
}
