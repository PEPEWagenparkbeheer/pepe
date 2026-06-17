'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WerkRegel, WerkDerdenRecord, AfterSalesAuto, WerkDerdenBestemming } from '@/types';
import { usePartnerLijst } from '@/hooks/usePartnerLijst';
import { authHeaders } from '@/lib/clientAuth';
import KentekenPlaat from '@/components/aftersales/KentekenPlaat';
import styles from './WerkDerdenModal.module.css';

interface Props {
  wie?: string;
  /** Bestaand record om te bewerken; afwezig = nieuw aanmaken */
  record?: WerkDerdenRecord;
  onSluiten: () => void;
  onIngediend: () => void;
  addRecord: (rec: Omit<WerkDerdenRecord, 'id' | 'created_at'>) => Promise<{ ok: boolean; error?: string }>;
  updateRecord?: (id: string, patch: Partial<WerkDerdenRecord>) => Promise<{ ok: boolean; error?: string }>;
  /** Eigen After Sales auto's van de partner — voor koppeling voertuigprijs */
  afterSalesAutos?: AfterSalesAuto[];
  /** Vaste auto uit After Sales — toont compacte "Offerte versturen"-modus, vast gekoppeld */
  vastAuto?: AfterSalesAuto;
}

export default function WerkDerdenModal({ wie, record, onSluiten, onIngediend, addRecord, updateRecord, afterSalesAutos = [], vastAuto }: Props) {
  const isBewerken = !!record;
  const isNieuwVoorstel = record?.status === 'afgekeurd';
  // Compacte offerte-modus: vaste auto uit After Sales, alleen kostenregels/bijlage/toelichting
  const isOfferte = !!vastAuto && !isBewerken;
  const [partnerNaam, setPartnerNaam] = useState(record?.partner ?? wie ?? '');
  const [kenteken, setKenteken] = useState(record?.kenteken ?? vastAuto?.kenteken ?? '');
  const [meldcode, setMeldcode] = useState(record?.meldcode ?? '');
  const [klant, setKlant] = useState(record?.klant ?? vastAuto?.klant ?? '');
  const [merk, setMerk] = useState(record?.merk ?? vastAuto?.merk ?? '');
  const [model, setModel] = useState(record?.model ?? vastAuto?.model ?? '');
  const [opzoeken, setOpzoeken] = useState(false);
  const [regels, setRegels] = useState<WerkRegel[]>(record?.regels?.length ? record.regels : [{ omschrijving: '', bedrag: 0 }]);
  const [notitie, setNotitie] = useState(record?.notitie ?? '');
  const [bijlageFile, setBijlageFile] = useState<File | null>(null);
  const [bijlagePreview, setBijlagePreview] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // After Sales auto-koppeling
  const [afterSalesId, setAfterSalesId] = useState<string | null>(record?.after_sales_id ?? vastAuto?.id ?? null);
  const [bestemming, setBestemming] = useState<WerkDerdenBestemming>(
    (record?.bestemming as WerkDerdenBestemming) ?? (vastAuto ? 'voertuigprijs' : 'doorbelasten')
  );
  const { namen: partnerNamen } = usePartnerLijst();

  function kentekenFmt(raw: string) {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function zoekKlant(kt: string) {
    if (kt.length < 5) return;
    setOpzoeken(true);
    try {
      const res = await fetch(`/api/werk-derden/lookup?kenteken=${encodeURIComponent(kt)}`, { headers: await authHeaders() });
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
        const uploadRes = await fetch('/api/werk-derden/bijlage', { method: 'POST', headers: await authHeaders(), body: fd });
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
          ...(afterSalesId ? { after_sales_id: afterSalesId, bestemming: 'voertuigprijs' as WerkDerdenBestemming } : { after_sales_id: undefined, bestemming: 'doorbelasten' as WerkDerdenBestemming }),
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
        ...(afterSalesId ? { after_sales_id: afterSalesId, bestemming: 'voertuigprijs' as WerkDerdenBestemming } : { bestemming: 'doorbelasten' as WerkDerdenBestemming }),
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
            <h2 className={styles.titel}>{isOfferte ? 'Offerte versturen' : isNieuwVoorstel ? 'Nieuw voorstel' : isBewerken ? 'Melding bewerken' : 'Kosten melden'}</h2>
            <span className={styles.sub}>{isOfferte ? 'Komt bij PEPE ter goedkeuring' : isNieuwVoorstel ? 'Afgekeurde melding aanpassen en opnieuw indienen' : 'Werk derden doorbelasten'}</span>
          </div>
          <button className={styles.sluitenKnop} onClick={onSluiten}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* Compacte auto-kop — alleen in offerte-modus (auto vast uit After Sales) */}
          {isOfferte && (
            <section className={styles.sectie}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <KentekenPlaat kenteken={kenteken || 'NNB'} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{[merk, model].filter(Boolean).join(' ') || 'Voertuig'}</div>
                  {klant && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{klant}</div>}
                </div>
              </div>
            </section>
          )}

          {/* Partner naam — alleen tonen voor PEPE-interne invoer, niet voor partners zelf */}
          {!wie && (
            <section className={styles.sectie}>
              <label className={styles.sectieLabel}>Partner naam</label>
              <select
                className={styles.invoer}
                value={partnerNaam}
                onChange={e => setPartnerNaam(e.target.value)}
              >
                <option value="">— Kies partner —</option>
                {partnerNamen.map(naam => (
                  <option key={naam} value={naam}>{naam}</option>
                ))}
                {partnerNaam && !partnerNamen.includes(partnerNaam) && (
                  <option value={partnerNaam}>{partnerNaam}</option>
                )}
              </select>
            </section>
          )}

          {/* After Sales auto koppeling */}
          {!isOfferte && afterSalesAutos.length > 0 && (
            <section className={styles.sectie}>
              <label className={styles.sectieLabel}>Koppeling</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type='button'
                  onClick={() => { setAfterSalesId(null); setBestemming('doorbelasten'); }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: !afterSalesId ? 'var(--accent)' : 'var(--surface)',
                    color: !afterSalesId ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
                  }}
                >Losse doorbelasting</button>
                <button
                  type='button'
                  onClick={() => { setBestemming('voertuigprijs'); if (!afterSalesId && afterSalesAutos.length) setAfterSalesId(afterSalesAutos[0].id); }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: afterSalesId ? 'var(--green, #52c47e)' : 'var(--surface)',
                    color: afterSalesId ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
                  }}
                >Koppel aan auto (voertuigprijs)</button>
              </div>
              {afterSalesId && (
                <select
                  className={styles.invoer}
                  value={afterSalesId}
                  onChange={e => {
                    const auto = afterSalesAutos.find(a => a.id === e.target.value);
                    if (!auto) return;
                    setAfterSalesId(auto.id);
                    setKenteken(auto.kenteken ?? '');
                    setMerk(auto.merk ?? '');
                    setModel(auto.model ?? '');
                    setKlant(auto.klant ?? '');
                  }}
                >
                  {afterSalesAutos.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.kenteken} — {a.merk} {a.model} {a.klant ? `(${a.klant})` : ''}
                    </option>
                  ))}
                </select>
              )}
              {afterSalesId && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, margin: 0 }}>
                  ✓ Kosten in voertuigprijs — geen aparte Twinfield-factuur
                </p>
              )}
            </section>
          )}

          {/* Kenteken + meldcode + klant — verborgen in offerte-modus (auto al gekoppeld) */}
          {!isOfferte && (<>
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Kenteken of meldcode <span className={styles.vereistLabel}>(minimaal één)</span></label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  className={styles.kentekenInput}
                  style={{ width: '100%' }}
                  placeholder="AB-123-C"
                  value={kenteken}
                  onChange={e => setKenteken(e.target.value.toUpperCase())}
                  onBlur={() => zoekKlant(ktFmt)}
                />
                {opzoeken && <span className={styles.zoekLabel}>Zoeken…</span>}
              </div>
              <input
                className={styles.invoer}
                style={{ flex: 1 }}
                placeholder="Meldcode"
                value={meldcode}
                onChange={e => setMeldcode(e.target.value)}
              />
            </div>
          </section>

          {/* Klant + voertuig */}
          <section className={styles.sectie}>
            <label className={styles.sectieLabel}>Klant</label>
            <input
              className={styles.invoer}
              placeholder="Naam klant / berijder…"
              value={klant}
              onChange={e => setKlant(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className={styles.invoer}
                style={{ flex: 1 }}
                placeholder="Merk"
                value={merk}
                onChange={e => setMerk(e.target.value)}
              />
              <input
                className={styles.invoer}
                style={{ flex: 1 }}
                placeholder="Model"
                value={model}
                onChange={e => setModel(e.target.value)}
              />
            </div>
          </section>
          </>)}

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
            disabled={bezig || !partnerNaam.trim() || (!isOfferte && !kenteken.trim() && !meldcode.trim())}
          >
            {bezig ? 'Verzenden…' : isOfferte ? 'Offerte versturen' : isNieuwVoorstel ? 'Nieuw voorstel sturen' : isBewerken ? 'Opslaan' : 'Indienen'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}


