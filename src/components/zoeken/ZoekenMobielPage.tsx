'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useZoekopdrachten } from '@/hooks/useZoekopdrachten';
import { authHeaders } from '@/lib/clientAuth';
import { BRANDSTOF, KLEUR_MAP, KLEUREN, MERKEN_LIJST, OPTIES, PROG } from '@/lib/constants';
import type { Zoekopdracht } from '@/types';
import styles from './ZoekenMobielPage.module.css';

type AiModus = 'spraak' | 'tekst';
type Scherm = 'lijst' | 'formulier';

interface FormState {
  klant: string;
  merk: string;
  model: string;
  details: string;
  km: string;
  jaar: string;
  budget: string;
  btw: string;
  email_klant: string;
  opmerkingen: string;
  kleuren: string[];
  opties: Record<string, boolean>;
  brandstof: string[];
  gewenste_rijdatum: string;
}

const LEEG_FORM: FormState = {
  klant: '', merk: '', model: '', details: '',
  km: '', jaar: '', budget: '', btw: '',
  email_klant: '', opmerkingen: '',
  kleuren: [], opties: {}, brandstof: [],
  gewenste_rijdatum: '',
};

export default function ZoekenMobielPage() {
  const { user } = useAuth();
  const { records, add, update, quickToggle } = useZoekopdrachten();

  const wieZoekt =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    '';

  const [scherm, setScherm] = useState<Scherm>('lijst');
  const [form, setForm] = useState<FormState>(LEEG_FORM);
  const [aiModus, setAiModus] = useState<AiModus>('spraak');
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState('');
  const [successFlash, setSuccessFlash] = useState('');

  const [tekst, setTekst] = useState('');
  const [verwerken, setVerwerken] = useState(false);

  const [luisteren, setLuisteren] = useState(false);
  const [spraakStatus, setSpraakStatus] = useState('');
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef('');

  const mijne = records.filter(
    (r) => !r.akkoord && !r.uitgesteld &&
      (r.wiezoekt ?? '').toLowerCase() === wieZoekt.toLowerCase()
  );

  const stelIn = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const toggleKleur = useCallback((k: string) => {
    setForm((f) => ({
      ...f,
      kleuren: f.kleuren.includes(k)
        ? f.kleuren.filter((x) => x !== k)
        : [...f.kleuren, k],
    }));
  }, []);

  const toggleOptie = useCallback((k: string) => {
    setForm((f) => ({ ...f, opties: { ...f.opties, [k]: !f.opties[k] } }));
  }, []);

  const toggleBrandstof = useCallback((k: string) => {
    setForm((f) => ({
      ...f,
      brandstof: f.brandstof.includes(k)
        ? f.brandstof.filter((x) => x !== k)
        : [...f.brandstof, k],
    }));
  }, []);

  async function verwerkTekst(invoer: string) {
    if (!invoer.trim()) return;
    setVerwerken(true);
    setFout('');
    try {
      const res = await fetch('/api/whatsapp-parse', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tekst: invoer }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const rawMerk = (data.merk ?? '') as string;
      const rawModel = (data.model ?? '') as string;
      const gevondenMerk = MERKEN_LIJST.find(
        (m) => rawMerk.toLowerCase() === m.toLowerCase() ||
               rawModel.toLowerCase().startsWith(m.toLowerCase() + ' ')
      ) ?? rawMerk;
      const gevondenModel = gevondenMerk
        ? rawModel.replace(new RegExp(`^${gevondenMerk}\\s*`, 'i'), '').trim() || rawModel
        : rawModel;
      setForm((f) => ({
        ...f,
        klant: (data.klant as string) || f.klant,
        merk: gevondenMerk || f.merk,
        model: gevondenModel || f.model,
        details: (data.details as string) || f.details,
        km: (data.km as string) || f.km,
        jaar: (data.jaar as string) || f.jaar,
        budget: (data.budget as string) || f.budget,
        btw: (data.btw as string) || f.btw,
        kleuren: (data.kleuren as string[])?.length ? data.kleuren : f.kleuren,
        brandstof: (data.brandstof as string[])?.length ? data.brandstof : f.brandstof,
        opties: Object.keys(data.opties ?? {}).length ? (data.opties as Record<string, boolean>) : f.opties,
        gewenste_rijdatum: (data.beschikbaar_vanaf as string) || f.gewenste_rijdatum,
      }));
    } catch (e) {
      setFout(`AI-verwerking mislukt: ${(e as Error).message}`);
    } finally {
      setVerwerken(false);
    }
  }

  function startLuisteren() {
    const SR =
      (typeof window !== 'undefined' &&
        (window.SpeechRecognition ?? window.webkitSpeechRecognition)) ??
      null;

    if (!SR) {
      setSpraakStatus('Spraakherkenning niet beschikbaar in deze browser.');
      return;
    }
    const rec = new SR();
    rec.lang = 'nl-NL';
    rec.continuous = false;
    rec.interimResults = true;

    finalRef.current = '';

    rec.onstart = () => {
      setLuisteren(true);
      setSpraakStatus('Luisteren… tik op ⏹ om te stoppen.');
    };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Overschrijf altijd met de volledige cumulatieve transcriptie (vermijdt dubbelingen)
      let acc = '';
      for (let i = 0; i < e.results.length; i++) {
        acc += e.results[i][0].transcript;
      }
      finalRef.current = acc;
    };
    rec.onerror = () => {
      setLuisteren(false);
      setSpraakStatus('Fout bij luisteren. Probeer opnieuw.');
      recRef.current = null;
    };
    rec.onend = () => {
      setLuisteren(false);
      setSpraakStatus('');
      recRef.current = null;
      const t = finalRef.current.trim();
      if (t) verwerkTekst(t);
    };
    recRef.current = rec;
    rec.start();
  }

  function stopLuisteren() {
    recRef.current?.stop();
  }

  async function handleOpslaan() {
    const autoStr = `${form.merk} ${form.model}`.trim();
    if (!form.klant || !autoStr) {
      setFout('Vul minstens de klantnaam en het merk in.');
      return;
    }
    setFout('');
    setOpslaan(true);
    try {
      await add({
        klant: form.klant,
        auto: autoStr,
        details: form.details || undefined,
        km: form.km || undefined,
        jaar: form.jaar || undefined,
        budget: form.budget || undefined,
        btw: form.btw || undefined,
        email_klant: form.email_klant || undefined,
        opmerkingen: form.opmerkingen || undefined,
        kleuren: form.kleuren,
        opties: form.opties,
        brandstof: form.brandstof,
        gewenste_rijdatum: form.gewenste_rijdatum || undefined,
        wiezoekt: wieZoekt || undefined,
        uitgewerkt: false,
        terugkoppeling: false,
        dealer: false,
        inkopen: false,
        contract: false,
        akkoord: false,
        uitgesteld: false,
        prio: false,
      });
      const flash = `${form.klant} · ${autoStr}`;
      setForm(LEEG_FORM);
      setTekst('');
      setScherm('lijst');
      setSuccessFlash(flash);
      window.scrollTo(0, 0);
    } catch (e) {
      setFout(`Opslaan mislukt: ${(e as Error).message}`);
    } finally {
      setOpslaan(false);
    }
  }

  useEffect(() => {
    if (!successFlash) return;
    const t = setTimeout(() => setSuccessFlash(''), 4000);
    return () => clearTimeout(t);
  }, [successFlash]);

  /* ── LIJST SCHERM ──────────────────────────────────────────────────── */
  if (scherm === 'lijst') {
    return (
      <div className={styles.pagina}>
        <div className={styles.lijstHeader}>
          <span className={styles.headerIcoon}>🔍</span>
          <span className={styles.titel}>Mijn zoekopdrachten</span>
        </div>

        {successFlash && (
          <div className={styles.successFlash}>✅ Opgeslagen: {successFlash}</div>
        )}

        <button className={styles.nieuweZoekKnop} onClick={() => {
          setForm(LEEG_FORM);
          setTekst('');
          setFout('');
          setScherm('formulier');
          window.scrollTo(0, 0);
        }}>
          + Nieuwe zoekopdracht
        </button>

        {mijne.length === 0 ? (
          <div className={styles.leegMelding}>Geen lopende opdrachten</div>
        ) : (
          <div className={styles.voortgangLijst}>
            {mijne.map((r) => (
              <VoortgangKaart
                key={r.id}
                record={r}
                onToggle={(id, veld) => quickToggle(id, veld)}
                onUpdate={async (id, opmerkingen) => {
                  const rec = records.find((x) => x.id === id);
                  if (rec) await update({ ...rec, opmerkingen });
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── FORMULIER SCHERM ──────────────────────────────────────────────── */
  return (
    <div className={styles.pagina}>
      <div className={styles.formulierHeader}>
        <button className={styles.terugKnop} onClick={() => setScherm('lijst')}>
          ← Terug
        </button>
        <span className={styles.formulierTitel}>Nieuwe zoekopdracht</span>
      </div>

      {fout && <div className={styles.foutMelding}>{fout}</div>}

      {/* AI-invoer */}
      <div className={styles.sectie}>
        <div className={styles.sectieTitel}>AI-invoer</div>
        <div className={styles.aiTabs}>
          <button
            className={`${styles.aiTab} ${aiModus === 'spraak' ? styles.aiTabActief : ''}`}
            onClick={() => setAiModus('spraak')}
          >
            🎙 Spraak
          </button>
          <button
            className={`${styles.aiTab} ${aiModus === 'tekst' ? styles.aiTabActief : ''}`}
            onClick={() => setAiModus('tekst')}
          >
            ✏️ Tekst
          </button>
        </div>

        {aiModus === 'spraak' ? (
          <>
            <p className={styles.spraakStatus}>
              {verwerken
                ? '⏳ Verwerken…'
                : luisteren
                  ? 'Luisteren… tik op ⏹ om te stoppen.'
                  : spraakStatus || 'Druk op de microfoon en spreek de zoekopdracht in.'}
            </p>
            <button
              className={`${styles.spraakKnop} ${luisteren ? styles.spraakKnopActief : ''}`}
              onClick={luisteren ? stopLuisteren : startLuisteren}
              disabled={verwerken}
              aria-label={luisteren ? 'Stop luisteren' : 'Start spraakherkenning'}
            >
              {verwerken ? '⏳' : luisteren ? '⏹' : '🎙'}
            </button>
          </>
        ) : (
          <>
            <textarea
              className="fi"
              rows={4}
              placeholder="Plak of typ de zoekopdracht hier…"
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              style={{ width: '100%', marginBottom: 10, resize: 'vertical' }}
            />
            <button
              className={styles.aiVerwerkKnop}
              disabled={verwerken || !tekst.trim()}
              onClick={() => verwerkTekst(tekst)}
            >
              {verwerken ? 'Verwerken…' : '✨ Formulier invullen'}
            </button>
          </>
        )}
      </div>

      {/* Auto */}
      <div className={styles.sectie}>
        <div className={styles.sectieTitel}>Auto</div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Merk</label>
          <select
            className="fi"
            value={form.merk}
            onChange={(e) => stelIn('merk', e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">— Selecteer merk —</option>
            {MERKEN_LIJST.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Model</label>
          <input
            className="fi"
            placeholder="bijv. 5-serie Touring"
            value={form.model}
            onChange={(e) => stelIn('model', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Brandstof</label>
          <div className={styles.pillGrid}>
            {BRANDSTOF.map(({ k, l }: { k: string; l: string }) => (
              <button
                key={k}
                className={`${styles.pill} ${form.brandstof.includes(k) ? styles.pillActief : ''}`}
                onClick={() => toggleBrandstof(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.veldRij}>
          <div>
            <label className={styles.veldLabel}>Bouwjaar (min)</label>
            <input
              className="fi"
              type="number"
              placeholder="2020"
              value={form.jaar}
              onChange={(e) => stelIn('jaar', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className={styles.veldLabel}>Max km</label>
            <input
              className="fi"
              type="number"
              placeholder="80000"
              value={form.km}
              onChange={(e) => stelIn('km', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Gewenste kleuren</label>
          <div className={styles.pillGrid}>
            {KLEUREN.map((k: string) => (
              <button
                key={k}
                className={`${styles.kleurPill} ${form.kleuren.includes(k) ? styles.kleurPillActief : ''}`}
                onClick={() => toggleKleur(k)}
              >
                <span
                  className={styles.kleurDot}
                  style={{ background: (KLEUR_MAP as Record<string, string>)[k] }}
                />
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Opties</label>
          <div className={styles.pillGrid}>
            {OPTIES.map(({ k, l }: { k: string; l: string }) => (
              <button
                key={k}
                className={`${styles.pill} ${form.opties[k] ? styles.pillActief : ''}`}
                onClick={() => toggleOptie(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Klant */}
      <div className={styles.sectie}>
        <div className={styles.sectieTitel}>Klant</div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Naam klant *</label>
          <input
            className="fi"
            placeholder="Achternaam"
            value={form.klant}
            onChange={(e) => stelIn('klant', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>E-mail klant</label>
          <input
            className="fi"
            type="email"
            placeholder="klant@email.nl"
            value={form.email_klant}
            onChange={(e) => stelIn('email_klant', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Budget & planning */}
      <div className={styles.sectie}>
        <div className={styles.sectieTitel}>Budget & planning</div>
        <div className={styles.veldRij}>
          <div>
            <label className={styles.veldLabel}>Max budget (€)</label>
            <input
              className="fi"
              type="number"
              placeholder="45000"
              value={form.budget}
              onChange={(e) => stelIn('budget', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className={styles.veldLabel}>BTW / Marge</label>
            <select
              className="fi"
              value={form.btw}
              onChange={(e) => stelIn('btw', e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">—</option>
              <option value="BTW">BTW</option>
              <option value="Marge">Marge</option>
            </select>
          </div>
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Beschikbaar vanaf</label>
          <input
            className={`fi ${styles.datumInput}`}
            type="date"
            value={form.gewenste_rijdatum}
            onChange={(e) => stelIn('gewenste_rijdatum', e.target.value)}
          />
        </div>
      </div>

      {/* Details */}
      <div className={styles.sectie}>
        <div className={styles.sectieTitel}>Details & opmerkingen</div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Bijzonderheden</label>
          <textarea
            className="fi"
            rows={3}
            placeholder="Bijv. geen panoramadak, liever donkere kleur…"
            value={form.details}
            onChange={(e) => stelIn('details', e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div className={styles.veldVol}>
          <label className={styles.veldLabel}>Interne notities</label>
          <input
            className="fi"
            placeholder="interne notities…"
            value={form.opmerkingen}
            onChange={(e) => stelIn('opmerkingen', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className={styles.submitBar}>
        <button
          className={styles.submitKnop}
          disabled={opslaan || !form.klant}
          onClick={handleOpslaan}
        >
          {opslaan ? 'Opslaan…' : '💾 Zoekopdracht opslaan'}
        </button>
      </div>
    </div>
  );
}

/* ── Voortgang kaart ─────────────────────────────────────────────────── */

function VoortgangKaart({
  record,
  onToggle,
  onUpdate,
}: {
  record: Zoekopdracht;
  onToggle: (id: string, veld: keyof Zoekopdracht) => Promise<void>;
  onUpdate: (id: string, opmerkingen: string) => Promise<void>;
}) {
  const [notitie, setNotitie] = useState(record.opmerkingen ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotitie(record.opmerkingen ?? '');
  }, [record.opmerkingen]);

  function handleNotitie(val: string) {
    setNotitie(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate(record.id, val), 700);
  }

  return (
    <div className={styles.zoekCard}>
      <div className={styles.zoekCardHdr}>
        <div>
          <div className={styles.zoekCardKlant}>{record.klant}</div>
          <div className={styles.zoekCardAuto}>{record.auto}</div>
        </div>
      </div>
      <div className={styles.progPills}>
        {PROG.map(({ k, l }: { k: string; l: string }) => {
          const aan = !!record[k as keyof Zoekopdracht];
          const isUitgesteld = k === 'uitgesteld';
          return (
            <button
              key={k}
              className={[
                styles.progPill,
                aan && (isUitgesteld ? styles.progUitgesteld : styles.progPillActief),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onToggle(record.id, k as keyof Zoekopdracht)}
            >
              {l}
            </button>
          );
        })}
      </div>
      <textarea
        className={styles.notitieVeld}
        placeholder="Notitie (bijv. dealer gebeld, prijs besproken…)"
        value={notitie}
        onChange={(e) => handleNotitie(e.target.value)}
        rows={2}
      />
    </div>
  );
}
