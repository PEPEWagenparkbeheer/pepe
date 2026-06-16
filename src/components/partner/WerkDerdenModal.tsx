'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WerkRegel, WerkDerdenRecord } from '@/types';
import styles from './WerkDerdenModal.module.css';

interface Props {
  wie?: string;
  /** Bestaand record om te bewerken; afwezig = nieuw aanmaken */
  record?: WerkDerdenRecord;
  onSluiten: () => void;
  onIngediend: () => void;
  addRecord: (rec: Omit<WerkDerdenRecord, 'id' | 'created_at'>) => Promise<{ ok: boolean; error?: string }>;
  updateRecord?: (id: string, patch: Partial<WerkDerdenRecord>) => Promise<{ ok: boolean; error?: string }>;
}

export default function WerkDerdenModal({ wie, record, onSluiten, onIngediend, addRecord, updateRecord }: Props) {
  const isBewerken = !!record;
  const isNieuwVoorstel = record?.status === 'afgekeurd';
  const [partnerNaam, setPartnerNaam] = useState(record?.partner ?? wie ?? '');
  const [kenteken, setKenteken] = useState(record?.kenteken ?? '');
  const [meldcode, setMeldcode] = useState(record?.meldcode ?? '');
  const [klant, setKlant] = useState(record?.klant ?? '');
  const [merk, setMerk] = useState(record?.merk ?? '');
  const [model, setModel] = useState(record?.model ?? '');
  const [opzoeken, setOpzoeken] = useState(false);
  const [regels, setRegels] = useState<WerkRegel[]>(record?.regels?.length ? record.regels : [{ omschrijving: '', bedrag: 0 }]);
  const [notitie, setNotitie] = useState(record?.notitie ?? '');
  const [bijlageFile, setBijlageFile] = useState<File | null>(null);
  const [bijlagePreview, setBijlagePreview] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function kentekenFmt(raw: string) {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function zoekKlant(kt: string) {
    if (kt.length < 5) return;
    setOpzoeken(true);
    try {
      const res = await fetch(`/api/werk-derden/lookup?kenteken=${encodeURIComponent(kt)}`);
      if (res.ok) {
        const json = await res.json() as { klant?: string; merk?: string; model?: string };
        if (json.klant) setKlant(json.klant);
        if (json.merk) setMerk(json.merk);
        if (json.model) setModel(json.model);
      }
    } catch {
      // Stil falen
    } finally {
      setOpzoeken(false);
    }
  }

  function regelWijzig(idx: number, veld: keyof WerkRegel, waarde: string | number) {
    setRegels(prev => prev.map((r, i) => i === idx ? { ...r, [veld]: waarde } : r));
  }

  function regelToevoegen() {
    setRegels(prev => [...prev, { omschrijving: '', bedrag: 0 }]);
  }

  function regelVerwijder(idx: number) {
    setRegels(prev => prev.filter((_, i) => i !== idx));
  }

  function handleBijlage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBijlageFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setBijlagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setBijlagePreview(null);
    }
  }

  const inkoopBedrag = regels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0);
  const ktFmt = kentekenFmt(kenteken);

  async function indienen() {
    if (!partnerNaam.trim()) {
      setFout('Vul een partnernaam in.');
      return;
    }
    if (!ktFmt && !meldcode.trim()) {
      setFout('Vul een kenteken of meldcode in.');
      return;
    }
    const geldig = regels.filter(r => r.omschrijving.trim() && Number(r.bedrag) > 0);
    if (geldig.length === 0) {
      setFout('Voeg minimaal één kostenregel toe.');
      return;
    }

    setFout('');
    setBezig(true);

    try {
      let bijlageStoragePath: string | undefined;
      if (bijlageFile) {
        const fd = new FormData();
        fd.append('file', bijlageFile);
        fd.append('kenteken', ktFmt || meldcode.trim());
        const uploadRes = await fetch('/api/werk-derden/bijlage', { method: 'POST', body: fd });
        if (uploadRes.ok) {
          const { path } = await uploadRes.json() as { path: string };
          bijlageStoragePath = path;
        }
      }

      if (isBewerken && record && updateRecord) {
        // Bewerken van bestaande melding (incl. afgekeurd → nieuw voorstel = terug naar open)
        const result = await updateRecord(record.id, {
          kenteken: ktFmt || undefined,
          meldcode: meldcode.trim() || undefined,
          merk: merk || undefined,
          model: model || undefined,
          klant: klant || undefined,
          regels: geldig,
          inkoop_bedrag: inkoopBedrag,
          notitie: notitie.trim() || undefined,
          status: 'open',
          afkeur_reden: undefined,
          ...(bijlageStoragePath ? { bijlage_storage_path: bijlageStoragePath } : {}),
        });
        if (!result.ok) {
          setFout(result.error ?? 'Opslaan mislukt');
          return;
        }
        onIngediend();
        onSluiten();
        return;
      }

      const result = await addRecord({
        partner: partnerNaam.trim(),
        kenteken: ktFmt || undefined,
        meldcode: meldcode.trim() || undefined,
        merk: merk || undefined,
        model: model || undefined,
        klant: klant || undefined,
        regels: geldig,
        btw_pct: 21,
        inkoop_bedrag: inkoopBedrag,
        notitie: notitie.trim() || undefined,
        bijlage_storage_path: bijlageStoragePath,
        status: 'open',
        toegevoegd_door: partnerNaam.trim(),
      });

      if (!result.ok) {
        setFout(result.error ?? 'Opslaan mislukt');
        return;
      }

      onIngediend();
      onSluiten();
    } finally {
      setBezig(false);
    }
  }

  return createPortal(
    <div
      onClick={onSluiten}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 9999,
        boxSizing: 'border-box',
      }}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.titel}>{isNieuwVoorstel ? 'Nieuw voorstel' : isBewerken ? 'Melding bewerken' : 'Kosten melden'}</h2>
            <span className={styles.sub}>{isNieuwVoorstel ? 'Afgekeurde melding aanpassen en opnieuw indienen' : 'Werk derden doorbelasten'}</span>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* Partner naam — alleen tonen voor PEPE-interne invoer, niet voor partners zelf */}
          {!wie && (
            <section className={styles.sectie}>
              <label className={styles.sectieLabel}>Partner naam</label>
              <input
                className={styles.invoer}
                placeholder="Naam van het bedrijf / partner…"
                value={partnerNaam}
                onChange={e => setPartnerNaam(e.target.value)}
              />
            </section>
          )}

          {/* Kenteken + meldcode */}
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Kenteken of meldcode <span className={styles.vereistLabel}>(minimaal één)</span></label>
            <input
              className={styles.kentekenInput}
              placeholder="AB-123-C"
              value={kenteken}
              onChange={e => setKenteken(e.target.value.toUpperCase())}
              onBlur={() => zoekKlant(ktFmt)}
            />
            {opzoeken && <span className={styles.zoekLabel}>Zoeken…</span>}
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>of</p>
            <input
              className={styles.invoer}
              placeholder="Meldcode"
              value={meldcode}
              onChange={e => setMeldcode(e.target.value)}
            />
            {(merk || model || klant) && (
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', paddingTop: 4 }}>
                {(merk || model) && <span>🚗 {[merk, model].filter(Boolean).join(' ')}</span>}
                {klant && <span>👤 {klant}</span>}
              </div>
            )}
          </section>

          {/* Kostenregels */}
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Kostenregels</label>
            <div className={styles.regelLijst}>
              {regels.map((r, i) => (
                <div key={i} className={styles.regelRij}>
                  <input
                    className={styles.regelOmschrijving}
                    placeholder="Omschrijving…"
                    value={r.omschrijving}
                    onChange={e => regelWijzig(i, 'omschrijving', e.target.value)}
                  />
                  <div className={styles.regelBedragWrapper}>
                    <span className={styles.euroTeken}>€</span>
                    <input
                      className={styles.regelBedrag}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={r.bedrag || ''}
                      onChange={e => regelWijzig(i, 'bedrag', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  {regels.length > 1 && (
                    <button className={styles.regelVerwijder} onClick={() => regelVerwijder(i)} title="Verwijder">✕</button>
                  )}
                </div>
              ))}
            </div>

            <button className={styles.regelToevoegen} onClick={regelToevoegen}>+ Regel toevoegen</button>

            {inkoopBedrag > 0 && (
              <div className={styles.totaalRij}>
                <span>Totaal excl. BTW</span>
                <div style={{ textAlign: 'right' }}>
                  <strong>{inkoopBedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}</strong>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Alle bedragen zijn ex. BTW</div>
                </div>
              </div>
            )}
          </section>

          {/* Bijlage */}
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Bijlage (offerte / foto)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className={styles.fileInputVerborgen}
              onChange={handleBijlage}
            />
            {bijlageFile ? (
              <div className={styles.bijlageInfo}>
                {bijlagePreview ? (
                  <img src={bijlagePreview} alt="Bijlage preview" className={styles.bijlagePreview} />
                ) : (
                  <span className={styles.bijlageNaam}>📎 {bijlageFile.name}</span>
                )}
                <button
                  className={styles.bijlageVerwijder}
                  onClick={() => { setBijlageFile(null); setBijlagePreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                >
                  Verwijder
                </button>
              </div>
            ) : (
              <button className={styles.bijlageKiezen} onClick={() => fileRef.current?.click()}>
                📎 PDF of foto kiezen
              </button>
            )}
          </section>

          {/* Notitie */}
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Toelichting (optioneel)</label>
            <textarea
              className={styles.textarea}
              placeholder="Extra info voor PEPE…"
              rows={3}
              value={notitie}
              onChange={e => setNotitie(e.target.value)}
            />
          </section>

          {fout && <div className={styles.foutmelding}>{fout}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.annuleerKnop} onClick={onSluiten} disabled={bezig}>Annuleren</button>
          <button
            className={styles.indienenKnop}
            onClick={indienen}
            disabled={bezig || !partnerNaam.trim() || (!kenteken.trim() && !meldcode.trim())}
          >
            {bezig ? 'Verzenden…' : isNieuwVoorstel ? 'Nieuw voorstel sturen' : isBewerken ? 'Opslaan' : 'Indienen'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
