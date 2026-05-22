'use client';

import { useEffect, useState } from 'react';
import type { Factuur } from '@/types';
import { rdwOpzoeken } from '@/lib/rdw';
import styles from './FacturenModal.module.css';

interface Props {
  factuur: Factuur | null;
  open: boolean;
  gebruiker: string;
  onSluiten: () => void;
  onOpslaan: (rec: Factuur) => Promise<unknown>;
  onAkkoord: (rec: Factuur) => Promise<unknown>;
  onPdfUrl: (path: string) => Promise<string | null>;
}

export default function FacturenModal({ factuur, open, onSluiten, onOpslaan, onAkkoord, onPdfUrl }: Props) {
  const [form, setForm] = useState<Factuur | null>(factuur);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [rdwBezig, setRdwBezig] = useState(false);

  useEffect(() => {
    if (!open || !factuur) { setForm(null); setPdfUrl(null); return; }
    setForm(factuur);
    if (factuur.pdf_storage_path) {
      onPdfUrl(factuur.pdf_storage_path).then(setPdfUrl);
    } else {
      setPdfUrl(null);
    }
  }, [open, factuur, onPdfUrl]);

  if (!open || !form) return null;

  function stel<K extends keyof Factuur>(veld: K, waarde: Factuur[K]) {
    setForm((f) => f ? { ...f, [veld]: waarde } : f);
  }

  async function rdwOphalen() {
    if (!form?.kenteken?.trim()) {
      alert('Vul eerst een kenteken in');
      return;
    }
    setRdwBezig(true);
    try {
      const rdw = await rdwOpzoeken(form.kenteken);
      if (!rdw) { alert('Geen RDW-data voor dit kenteken'); return; }
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
    if (!form.bedrijfsnaam?.trim()) { alert('Bedrijfsnaam is verplicht'); return; }
    setBezig(true);
    // Eerst opslaan zodat backend met de laatste edits werkt
    await onOpslaan(form);
    await onAkkoord(form);
    setBezig(false);
  }

  const klaarVoorAkkoord = !!form.kenteken?.trim() && !!form.bedrijfsnaam?.trim();
  const rdw = form.rdw_data;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titel}>
            📄 Factuur {form.factuurnummer ? `#${form.factuurnummer}` : ''}
            {form.afzender && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>· {form.afzender}</span>}
          </div>
          <button className={styles.sluit} onClick={onSluiten}>×</button>
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
                <button className="btn" type="button" onClick={rdwOphalen} disabled={rdwBezig || !form.kenteken}>
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
              <label>Bedrijfsnaam *</label>
              <input className="fi" value={form.bedrijfsnaam ?? ''}
                onChange={(e) => stel('bedrijfsnaam', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>KvK-nummer</label>
              <input className="fi" value={form.kvk ?? ''}
                onChange={(e) => stel('kvk', e.target.value)} />
            </div>

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
