'use client';

import { useEffect, useRef, useState } from 'react';
import type { Factuur } from '@/types';
import { rdwOpzoeken } from '@/lib/rdw';
import { authHeaders } from '@/lib/clientAuth';
import styles from './FacturenModal.module.css';

interface Props {
  factuur: Factuur | null;
  open: boolean;
  gebruiker: string;
  onSluiten: () => void;
  onOpslaan: (rec: Factuur) => Promise<unknown>;
  onAkkoord: (rec: Factuur) => Promise<unknown>;
  onPdfUrl: (path: string) => Promise<string | null>;
  onReExtract: (id: string) => Promise<Factuur | null>;
}

export default function FacturenModal({ factuur, open, onSluiten, onOpslaan, onAkkoord, onPdfUrl, onReExtract }: Props) {
  const [form, setForm] = useState<Factuur | null>(factuur);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [rdwBezig, setRdwBezig] = useState(false);
  const [kvkBezig, setKvkBezig] = useState(false);
  const laatsteKvkNummer = useRef<string>('');
  const [extractBezig, setExtractBezig] = useState(false);
  const laatsteRdwKenteken = useRef<string>('');

  useEffect(() => {
    if (!open || !factuur) { setForm(null); setPdfUrl(null); return; }
    setForm(factuur);
    // Beschouw bestaande rdw_data van factuur als 'laatste lookup' zodat
    // we niet onnodig opnieuw fetchen bij openen.
    laatsteRdwKenteken.current = factuur.rdw_data?.merk
      ? (factuur.kenteken ?? '').replace(/[-\s]/g, '').toUpperCase()
      : '';
    if (factuur.pdf_storage_path) {
      onPdfUrl(factuur.pdf_storage_path).then(setPdfUrl);
    } else {
      setPdfUrl(null);
    }
  }, [open, factuur, onPdfUrl]);

  // Auto-RDW zodra er een compleet kenteken (6 tekens) in het veld staat
  // dat verschilt van wat we de vorige keer hebben opgehaald. Debounce 600ms
  // zodat we niet bij elke keystroke vuren.
  const kenteken = form?.kenteken ?? '';
  useEffect(() => {
    const norm = kenteken.replace(/[-\s]/g, '').toUpperCase();
    if (norm.length !== 6) return;
    if (norm === laatsteRdwKenteken.current) return;
    const t = setTimeout(() => { void rdwOphalen(true); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kenteken]);
  // Auto-KVK zodra er een 8-cijferig KVK-nummer staat dat verschilt van de vorige lookup.
  const kvkWaarde = form?.kvk ?? '';
  useEffect(() => {
    const norm = kvkWaarde.replace(/\D/g, '');
    if (norm.length !== 8) return;
    if (norm === laatsteKvkNummer.current) return;
    const t = setTimeout(() => { void kvkOphalen(true); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kvkWaarde]);


  if (!open || !form) return null;

  function stel<K extends keyof Factuur>(veld: K, waarde: Factuur[K]) {
    setForm((f) => f ? { ...f, [veld]: waarde } : f);
  }

  async function opnieuwExtraheren() {
    if (!form) return;
    if (!form.pdf_storage_path) { alert('Geen PDF beschikbaar om opnieuw te extraheren'); return; }
    setExtractBezig(true);
    try {
      const rec = await onReExtract(form.id);
      if (rec) setForm(rec);
      else alert('Re-extract mislukt — zie console');
    } finally {
      setExtractBezig(false);
    }
  }

  async function rdwOphalen(stil = false) {
    if (!form?.kenteken?.trim()) {
      if (!stil) alert('Vul eerst een kenteken in');
      return;
    }
    const norm = form.kenteken.replace(/[-\s]/g, '').toUpperCase();
    laatsteRdwKenteken.current = norm;
    setRdwBezig(true);
    try {
      const rdw = await rdwOpzoeken(form.kenteken);
      if (!rdw) {
        if (!stil) alert('Geen RDW-data voor dit kenteken');
        return;
      }
      const v = rdw.voertuig;
      stel('rdw_data', {
        merk: v.merk,
        handelsbenaming: v.handelsbenaming,
        brandstof: rdw.brandstof,
        catalogusprijs: rdw.catalogusprijs,
        apkDatum: rdw.apkDatum,
        recalls: rdw.recalls.length,
      });
    } finally {
      setRdwBezig(false);
    }
  }

  async function handleOpslaan() {
    if (!form) return;
    setBezig(true);
    await onOpslaan(form);
    setBezig(false);
    onSluiten();
  }

  async function handleAkkoord() {
    if (!form) return;
    if (!form.kenteken?.trim()) { alert('Kenteken is verplicht'); return; }
    if (form.is_bedrijf !== false && !form.bedrijfsnaam?.trim()) {
      alert('Bedrijfsnaam is verplicht (zakelijk)'); return;
    }
    if (form.is_bedrijf === false && !form.berijder_naam?.trim()) {
      alert('Berijder-naam is verplicht (particulier)'); return;
    }
    setBezig(true);
    // Eerst opslaan zodat backend met de laatste edits werkt
    await onOpslaan(form);
    await onAkkoord(form);
    setBezig(false);
  }
  async function kvkOphalen(stil = false) {
    if (!form?.kvk?.trim()) {
      if (!stil) alert('Vul eerst een KVK-nummer in');
      return;
    }
    const norm = form.kvk.replace(/\D/g, '');
    if (norm.length !== 8) {
      if (!stil) alert('KVK-nummer moet 8 cijfers zijn');
      return;
    }
    laatsteKvkNummer.current = norm;
    setKvkBezig(true);
    try {
      const res = await fetch(`/api/kvk/lookup?kvk=${norm}`, { headers: await authHeaders() });
      if (!res.ok) {
        if (!stil) alert('Geen KVK-gegevens gevonden voor dit nummer');
        return;
      }
      const d = await res.json() as {
        gevonden: boolean; naam?: string; straat?: string;
        postcode?: string; plaats?: string; land?: string;
      };
      if (!d.gevonden) {
        if (!stil) alert('KVK-nummer niet gevonden in het Handelsregister');
        return;
      }
      // Alleen invullen als het veld nog leeg is (auto-fill, niet overschrijven)
      setForm((f) => {
        if (!f) return f;
        return {
          ...f,
          bedrijfsnaam: f.bedrijfsnaam?.trim() ? f.bedrijfsnaam : (d.naam ?? f.bedrijfsnaam),
          straat:       f.straat?.trim()       ? f.straat       : (d.straat ?? f.straat),
          postcode:     f.postcode?.trim()     ? f.postcode     : (d.postcode ?? f.postcode),
          plaats:       f.plaats?.trim()       ? f.plaats       : (d.plaats ?? f.plaats),
          land:         f.land?.trim()         ? f.land         : (d.land ?? f.land),
        };
      });
    } finally {
      setKvkBezig(false);
    }
  }


  const isBedrijf = form.is_bedrijf !== false;
  const klaarVoorAkkoord = !!form.kenteken?.trim() && (
    isBedrijf ? !!form.bedrijfsnaam?.trim() : !!form.berijder_naam?.trim()
  );
  const rdw = form.rdw_data;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titel}>
            📄 Factuur {form.factuurnummer ? `#${form.factuurnummer}` : ''}
            {form.afzender && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>· {form.afzender}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={opnieuwExtraheren}
              disabled={extractBezig || !form.pdf_storage_path}
              title="Run Groq + RDW opnieuw op de PDF"
            >
              {extractBezig ? '⏳ Bezig...' : '🔄 Opnieuw extraheren'}
            </button>
            <button className={styles.sluit} onClick={onSluiten}>×</button>
          </div>
        </div>

        <div className={styles.body}>
          {/* PDF preview links */}
          <div className={styles.pdfBox}>
            {pdfUrl ? (
              <iframe className={styles.pdfFrame} src={pdfUrl} title="Factuur PDF" />
            ) : (
              <div className={styles.pdfLeeg}>
                {form.pdf_storage_path ? 'PDF laden...' : 'Geen PDF aanwezig'}
              </div>
            )}
            {pdfUrl && (
              <div className={styles.pdfDownload}>
                <span>{form.pdf_bestandsnaam}</span>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">⤓ Downloaden</a>
              </div>
            )}
          </div>

          {/* Velden rechts */}
          <div className={styles.velden}>
            {form.hubspot_error && (
              <div className={styles.foutBox}>
                <strong>HubSpot-fout:</strong> {form.hubspot_error}
              </div>
            )}

            <div className={styles.sectieKop}>Factuur</div>

            <div className={styles.fg}>
              <label>Factuurnummer</label>
              <input className="fi" value={form.factuurnummer ?? ''}
                onChange={(e) => stel('factuurnummer', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Factuurdatum (inzetdatum)</label>
              <input className="fi" type="date" value={form.factuurdatum ?? ''}
                onChange={(e) => stel('factuurdatum', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Bedrag excl. BTW</label>
              <input className="fi" type="number" step="0.01" value={form.bedrag_excl_btw ?? ''}
                onChange={(e) => stel('bedrag_excl_btw', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
            <div className={styles.fg}>
              <label>Bedrag incl. BTW</label>
              <input className="fi" type="number" step="0.01" value={form.bedrag_incl_btw ?? ''}
                onChange={(e) => stel('bedrag_incl_btw', e.target.value === '' ? null : Number(e.target.value))} />
            </div>

            <div className={styles.sectieKop}>Auto</div>

            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Kenteken *</label>
              <div className={styles.rdwRij}>
                <input
                  className="fi"
                  placeholder="AB123C"
                  value={form.kenteken ?? ''}
                  onChange={(e) => stel('kenteken', e.target.value.toUpperCase().replace(/[-\s]/g, ''))}
                />
                <button className="btn" type="button" onClick={() => rdwOphalen()} disabled={rdwBezig || !form.kenteken}>
                  {rdwBezig ? '⏳ RDW...' : '🔍 RDW ophalen'}
                </button>
              </div>
            </div>

            {rdw && (
              <div className={styles.rdwInfo}>
                <div><label>Merk</label><div>{rdw.merk ?? '—'}</div></div>
                <div><label>Model</label><div>{rdw.handelsbenaming ?? '—'}</div></div>
                <div><label>Brandstof</label><div>{rdw.brandstof ?? '—'}</div></div>
                <div><label>APK</label><div>{rdw.apkDatum ?? '—'}</div></div>
                <div><label>Fiscale waarde</label><div>{rdw.catalogusprijs != null ? `€ ${rdw.catalogusprijs.toLocaleString('nl-NL')}` : '—'}</div></div>
              </div>
            )}

            <div className={styles.sectieKop}>Klant</div>

            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Type klant</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn ${isBedrijf ? 'btn-a' : ''}`}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => stel('is_bedrijf', true)}
                >🏢 Bedrijf</button>
                <button
                  type="button"
                  className={`btn ${!isBedrijf ? 'btn-a' : ''}`}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => stel('is_bedrijf', false)}
                >👤 Particulier</button>
              </div>
            </div>

            {isBedrijf && (
              <>
                <div className={`${styles.fg} ${styles.vol}`}>
                  <label>Bedrijfsnaam *</label>
                  <input className="fi" value={form.bedrijfsnaam ?? ''}
                    onChange={(e) => stel('bedrijfsnaam', e.target.value)} />
                </div>
                <div className={`${styles.fg} ${styles.vol}`}>
                  <label>KvK-nummer</label>
                  <div className={styles.rdwRij}>
                    <input
                      className="fi"
                      placeholder="12345678"
                      value={form.kvk ?? ""}
                      onChange={(e) => stel("kvk", e.target.value.replace(/\D/g, ""))}
                    />
                    <button className="btn" type="button" onClick={() => kvkOphalen()} disabled={kvkBezig || !form.kvk}>
                      {kvkBezig ? "⏳ KVK..." : "🔍 KVK ophalen"}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Straat + huisnummer</label>
              <input className="fi" placeholder="Torenbaan 123" value={form.straat ?? ''}
                onChange={(e) => stel('straat', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Postcode</label>
              <input className="fi" placeholder="1234 AB" value={form.postcode ?? ''}
                onChange={(e) => stel('postcode', e.target.value.toUpperCase())} />
            </div>
            <div className={styles.fg}>
              <label>Plaats</label>
              <input className="fi" value={form.plaats ?? ''}
                onChange={(e) => stel('plaats', e.target.value)} />
            </div>
            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Land</label>
              <input className="fi" placeholder="Nederland" value={form.land ?? ''}
                onChange={(e) => stel('land', e.target.value)} />
            </div>

            <div className={styles.fg}>
              <label>Berijder</label>
              <input className="fi" placeholder="Voornaam Achternaam" value={form.berijder_naam ?? ''}
                onChange={(e) => stel('berijder_naam', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Berijder e-mail</label>
              <input className="fi" type="email" value={form.berijder_email ?? ''}
                onChange={(e) => stel('berijder_email', e.target.value)} />
            </div>

            <div className={`${styles.fg} ${styles.vol}`}>
              <label>Notitie</label>
              <textarea className="fi" rows={2} value={form.notitie ?? ''}
                onChange={(e) => stel('notitie', e.target.value)} />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLinks}>
            {form.hubspot_deal_id && <>✅ Reeds in HubSpot · Deal {form.hubspot_deal_id}</>}
          </div>
          <button className="btn" onClick={onSluiten}>Sluiten</button>
          <button className="btn" onClick={handleOpslaan} disabled={bezig}>
            {bezig ? '...' : '💾 Opslaan'}
          </button>
          <button
            className="btn btn-a"
            onClick={handleAkkoord}
            disabled={bezig || !klaarVoorAkkoord}
            title={klaarVoorAkkoord ? 'Wegschrijven naar HubSpot' : 'Kenteken en bedrijfsnaam zijn verplicht'}
          >
            {bezig ? '...' : '✅ Goedkeuren → HubSpot'}
          </button>
        </div>
      </div>
    </div>
  );
}

