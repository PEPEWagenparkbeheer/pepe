'use client';

import { useEffect, useRef, useState } from 'react';
import type { Factuur, Documenttype } from '@/types';
import type { MatchKeuze, MatchSuggesties } from '@/types/match';
import { rdwOpzoeken } from '@/lib/rdw';
import { authHeaders } from '@/lib/clientAuth';
import { htmlNaarTekst, extractOrigineleSectie } from '@/lib/htmlNaarTekst';
import MatchBevestigModal from './MatchBevestigModal';
import styles from './FacturenModal.module.css';

const DOCUMENTTYPE_LABEL: Record<Documenttype, string> = {
  factuur: 'Factuur',
  bestelbevestiging: 'Bestelbevestiging',
  inzetbevestiging: 'Inzetbevestiging',
  autokosten: 'Autokosten',
};

const DOCUMENTTYPE_ICOON: Record<Documenttype, string> = {
  factuur: '📄',
  bestelbevestiging: '🛒',
  inzetbevestiging: '🚗',
  autokosten: '🔧',
};

interface Props {
  factuur: Factuur | null;
  open: boolean;
  gebruiker: string;
  onSluiten: () => void;
  onOpslaan: (rec: Factuur) => Promise<unknown>;
  onAkkoord: (rec: Factuur, match?: MatchKeuze) => Promise<unknown>;
  onPdfUrl: (path: string) => Promise<string | null>;
  onReExtract: (id: string) => Promise<Factuur | null>;
}

// ── Type-specifieke formulier-secties ────────────────────────
type StelFn = <K extends keyof Factuur>(veld: K, waarde: Factuur[K]) => void;

function SectieContract({ form, stel }: { form: Factuur; stel: StelFn }) {
  return (
    <>
      <div className={styles.sectieKop}>Contract</div>
      <div className={`${styles.fg} ${styles.vol}`}>
        <label>Contractnummer *</label>
        <input className="fi" placeholder="1860533" value={form.contractnummer ?? ''}
          onChange={(e) => stel('contractnummer', e.target.value)} />
      </div>
      <div className={styles.fg}>
        <label>Merk / Model</label>
        <input className="fi" placeholder="Tesla Model 3" value={form.merk_model ?? ''}
          onChange={(e) => stel('merk_model', e.target.value)} />
      </div>
      <div className={styles.fg}>
        <label>Looptijd (mnd)</label>
        <input className="fi" type="number" placeholder="60" value={form.looptijd_maanden ?? ''}
          onChange={(e) => stel('looptijd_maanden', e.target.value === '' ? null : Number(e.target.value))} />
      </div>
      <div className={styles.fg}>
        <label>Jaarkilometrage</label>
        <input className="fi" type="number" placeholder="30000" value={form.jaarkilometrage ?? ''}
          onChange={(e) => stel('jaarkilometrage', e.target.value === '' ? null : Number(e.target.value))} />
      </div>
      <div className={styles.fg}>
        <label>Type aanschaf</label>
        <select className="fi" value={form.type_aanschaf ?? ''}
          onChange={(e) => stel('type_aanschaf', e.target.value || null)}>
          <option value="">— kies —</option>
          <option value="Full operational">Full operational</option>
          <option value="shortlease">Shortlease</option>
        </select>
      </div>
      <div className={styles.fg}>
        <label>Banden</label>
        <select className="fi" value={form.banden ?? ''}
          onChange={(e) => stel('banden', e.target.value || null)}>
          <option value="">— kies —</option>
          <option value="Zomer">Zomerbanden</option>
          <option value="Winter">Winter- &amp; zomerbanden</option>
          <option value="All season">4-seizoenen</option>
        </select>
      </div>
      <div className={`${styles.fg} ${styles.vol}`}>
        <label>Leasemaatschappij</label>
        <input className="fi" placeholder="Hiltermann Lease" value={form.leasemaatschappij ?? ''}
          onChange={(e) => stel('leasemaatschappij', e.target.value)} />
      </div>
    </>
  );
}

function SectieKenteken({
  form, stel, rdwOphalen, rdwBezig,
}: { form: Factuur; stel: StelFn; rdwOphalen: (stil?: boolean) => void; rdwBezig: boolean }) {
  const rdw = form.rdw_data;
  return (
    <>
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
    </>
  );
}

function SectieKlant({
  form, stel, isBedrijf, kvkOphalen, kvkBezig,
}: { form: Factuur; stel: StelFn; isBedrijf: boolean; kvkOphalen: (stil?: boolean) => void; kvkBezig: boolean }) {
  return (
    <>
      <div className={styles.sectieKop}>Klant</div>
      <div className={`${styles.fg} ${styles.vol}`}>
        <label>Type klant</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`btn ${isBedrijf ? 'btn-a' : ''}`}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => stel('is_bedrijf', true)}>🏢 Bedrijf</button>
          <button type="button" className={`btn ${!isBedrijf ? 'btn-a' : ''}`}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => stel('is_bedrijf', false)}>👤 Particulier</button>
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
              <input className="fi" placeholder="12345678"
                value={form.kvk ?? ''}
                onChange={(e) => stel('kvk', e.target.value.replace(/\D/g, ''))} />
              <button className="btn" type="button" onClick={() => kvkOphalen()} disabled={kvkBezig || !form.kvk}>
                {kvkBezig ? '⏳ KVK...' : '🔍 KVK ophalen'}
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
    </>
  );
}

function SectieKlantLease({
  form, stel, kvkOphalen, kvkBezig,
}: { form: Factuur; stel: StelFn; kvkOphalen: (stil?: boolean) => void; kvkBezig: boolean }) {
  return (
    <>
      <div className={styles.sectieKop}>Klant (lessee)</div>
      <div className={`${styles.fg} ${styles.vol}`}>
        <label>Bedrijfsnaam *</label>
        <input className="fi" value={form.bedrijfsnaam ?? ''}
          onChange={(e) => stel('bedrijfsnaam', e.target.value)} />
      </div>
      <div className={`${styles.fg} ${styles.vol}`}>
        <label>KvK-nummer</label>
        <div className={styles.rdwRij}>
          <input className="fi" placeholder="12345678"
            value={form.kvk ?? ''}
            onChange={(e) => stel('kvk', e.target.value.replace(/\D/g, ''))} />
          <button className="btn" type="button" onClick={() => kvkOphalen()} disabled={kvkBezig || !form.kvk}>
            {kvkBezig ? '⏳ KVK...' : '🔍 KVK ophalen'}
          </button>
        </div>
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
      <div className={styles.sectieKop}>Berijder</div>
      <div className={styles.fg}>
        <label>Naam</label>
        <input className="fi" placeholder="Voornaam Achternaam" value={form.berijder_naam ?? ''}
          onChange={(e) => stel('berijder_naam', e.target.value)} />
      </div>
      <div className={styles.fg}>
        <label>E-mail</label>
        <input className="fi" type="email" value={form.berijder_email ?? ''}
          onChange={(e) => stel('berijder_email', e.target.value)} />
      </div>
    </>
  );
}

// ── Hoofd-component ──────────────────────────────────────────
export default function FacturenModal({
  factuur, open, onSluiten, onOpslaan, onAkkoord, onPdfUrl, onReExtract,
}: Props) {
  const [form, setForm] = useState<Factuur | null>(factuur);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [matchSuggesties, setMatchSuggesties] = useState<MatchSuggesties | null>(null);
  const [rdwBezig, setRdwBezig] = useState(false);
  const [kvkBezig, setKvkBezig] = useState(false);
  const [extractBezig, setExtractBezig] = useState(false);
  const laatsteRdwKenteken = useRef<string>('');
  const laatsteKvkNummer = useRef<string>('');

  useEffect(() => {
    if (!open || !factuur) { setForm(null); setPdfUrl(null); return; }
    setForm(factuur);
    laatsteRdwKenteken.current = factuur.rdw_data?.merk
      ? (factuur.kenteken ?? '').replace(/[-\s]/g, '').toUpperCase()
      : '';
    if (factuur.pdf_storage_path) {
      onPdfUrl(factuur.pdf_storage_path).then(setPdfUrl);
    } else {
      setPdfUrl(null);
    }
  }, [open, factuur, onPdfUrl]);

  // Auto-RDW bij 6-teken kenteken
  const kenteken = form?.kenteken ?? '';
  useEffect(() => {
    const norm = kenteken.replace(/[-\s]/g, '').toUpperCase();
    if (norm.length !== 6) return;
    if (norm === laatsteRdwKenteken.current) return;
    const t = setTimeout(() => { void rdwOphalen(true); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kenteken]);

  // Auto-KVK bij 8-cijferig KVK
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

  const dt = form.documenttype ?? 'factuur';
  const isBedrijf = form.is_bedrijf !== false;

  function stel<K extends keyof Factuur>(veld: K, waarde: Factuur[K]) {
    setForm((f) => f ? { ...f, [veld]: waarde } : f);
  }

  // Klaar-validatie per type
  function klaarVoorAkkoord(): boolean {
    if (dt === 'factuur') {
      return !!form?.kenteken?.trim() && (isBedrijf ? !!form?.bedrijfsnaam?.trim() : !!form?.berijder_naam?.trim());
    }
    if (dt === 'bestelbevestiging') {
      return !!form?.contractnummer?.trim() && !!form?.bedrijfsnaam?.trim();
    }
    if (dt === 'inzetbevestiging') {
      return !!form?.kenteken?.trim() && !!form?.contractnummer?.trim() && !!form?.bedrijfsnaam?.trim();
    }
    if (dt === 'autokosten') {
      return !!form?.kenteken?.trim();
    }
    return false;
  }

  function klaarHint(): string {
    if (dt === 'factuur') return 'Kenteken en bedrijfsnaam zijn verplicht';
    if (dt === 'bestelbevestiging') return 'Contractnummer en bedrijfsnaam (lessee) zijn verplicht';
    if (dt === 'inzetbevestiging') return 'Kenteken, contractnummer en bedrijfsnaam (lessee) zijn verplicht';
    if (dt === 'autokosten') return 'Kenteken is verplicht';
    return '';
  }

  async function opnieuwExtraheren() {
    if (!form) return;
    if (!form.pdf_storage_path && !form.raw_email) { alert('Geen document of mailbody beschikbaar om opnieuw te extraheren'); return; }
    setExtractBezig(true);
    try {
      // Sla eerst op zodat documenttype (en evt. handmatige wijzigingen) in de DB staan
      await onOpslaan(form);
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
      if (!rdw) { if (!stil) alert('Geen RDW-data voor dit kenteken'); return; }
      const v = rdw.voertuig;
      stel('rdw_data', {
        merk: v.merk, handelsbenaming: v.handelsbenaming,
        brandstof: rdw.brandstof, catalogusprijs: rdw.catalogusprijs,
        apkDatum: rdw.apkDatum, recalls: rdw.recalls.length,
      });
    } finally {
      setRdwBezig(false);
    }
  }

  async function kvkOphalen(stil = false) {
    if (!form?.kvk?.trim()) { if (!stil) alert('Vul eerst een KVK-nummer in'); return; }
    const norm = form.kvk.replace(/\D/g, '');
    if (norm.length !== 8) { if (!stil) alert('KVK-nummer moet 8 cijfers zijn'); return; }
    laatsteKvkNummer.current = norm;
    setKvkBezig(true);
    try {
      const res = await fetch(`/api/kvk/lookup?kvk=${norm}`, { headers: await authHeaders() });
      if (!res.ok) { if (!stil) alert('Geen KVK-gegevens gevonden'); return; }
      const d = await res.json() as {
        gevonden: boolean; naam?: string; straat?: string;
        postcode?: string; plaats?: string; land?: string;
      };
      if (!d.gevonden) { if (!stil) alert('KVK-nummer niet gevonden'); return; }
      setForm((f) => {
        if (!f) return f;
        return {
          ...f,
          bedrijfsnaam: f.bedrijfsnaam?.trim() ? f.bedrijfsnaam : (d.naam ?? f.bedrijfsnaam),
          straat:       f.straat?.trim()       ? f.straat       : (d.straat ?? f.straat),
          postcode:     f.postcode?.trim()      ? f.postcode     : (d.postcode ?? f.postcode),
          plaats:       f.plaats?.trim()        ? f.plaats       : (d.plaats ?? f.plaats),
          land:         f.land?.trim()          ? f.land         : (d.land ?? f.land),
        };
      });
    } finally {
      setKvkBezig(false);
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
    if (dt === 'factuur' || dt === 'autokosten' || dt === 'inzetbevestiging') {
      if (!form.kenteken?.trim()) { alert('Kenteken is verplicht'); return; }
    }
    if (dt === 'bestelbevestiging' || dt === 'inzetbevestiging') {
      if (!form.contractnummer?.trim()) { alert('Contractnummer is verplicht'); return; }
    }
    if (dt === 'factuur') {
      if (isBedrijf && !form.bedrijfsnaam?.trim()) { alert('Bedrijfsnaam is verplicht (zakelijk)'); return; }
      if (!isBedrijf && !form.berijder_naam?.trim()) { alert('Berijder-naam is verplicht (particulier)'); return; }
    }
    if (dt === 'bestelbevestiging' || dt === 'inzetbevestiging') {
      if (!form.bedrijfsnaam?.trim()) { alert('Bedrijfsnaam (lessee) is verplicht'); return; }
    }
    setBezig(true);
    await onOpslaan(form);

    // Autokosten heeft geen berijder/bedrijf — direct doorgaan
    if (dt !== 'autokosten') {
      try {
        const res = await fetch(`/api/facturen/${form.id}/match-suggesties`, {
          headers: await authHeaders(),
        });
        if (res.ok) {
          const sug: MatchSuggesties = await res.json();
          if (sug.berijder.kandidaten.length > 0 || sug.bedrijf.kandidaten.length > 0) {
            setMatchSuggesties(sug);
            setBezig(false);
            return;
          }
        }
      } catch {
        // best-effort: doorgaan zonder modal
      }
    }

    await onAkkoord(form, undefined);
    setBezig(false);
  }

  async function bevestigMatch(keuze: MatchKeuze) {
    if (!form) return;
    setMatchSuggesties(null);
    setBezig(true);
    await onAkkoord(form, keuze);
    setBezig(false);
  }

  const isKlaar = klaarVoorAkkoord();

  return (
    <>
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onSluiten()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titel}>
            {DOCUMENTTYPE_ICOON[dt]} {DOCUMENTTYPE_LABEL[dt]}
            {form.factuurnummer ? ` #${form.factuurnummer}` : form.contractnummer ? ` ${form.contractnummer}` : ''}
            {form.afzender && (
              <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                · {form.afzender}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={opnieuwExtraheren}
              disabled={extractBezig || (!form.pdf_storage_path && !form.raw_email)}
              title="Opnieuw extraheren">
              {extractBezig ? '⏳ Bezig...' : '🔄 Opnieuw extraheren'}
            </button>
            <button className={styles.sluit} onClick={onSluiten}>×</button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Document preview: PDF of mailbody */}
          <div className={styles.pdfBox}>
            {pdfUrl ? (
              <iframe className={styles.pdfFrame} src={pdfUrl} title="Document PDF" />
            ) : form.raw_email ? (
              <pre className={styles.mailBody}>{extractOrigineleSectie(htmlNaarTekst(form.raw_email))}</pre>
            ) : (
              <div className={styles.pdfLeeg}>
                {form.pdf_storage_path ? 'PDF laden...' : 'Geen document aanwezig'}
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

            {/* Documenttype — altijd */}
            <div className={styles.fg}>
              <label>Documenttype</label>
              <select className="fi" value={dt}
                onChange={async (e) => {
                  const nieuwType = e.target.value as Documenttype;
                  const updatedForm = { ...form, documenttype: nieuwType };
                  setForm(updatedForm);
                  if (updatedForm.pdf_storage_path || updatedForm.raw_email) {
                    setExtractBezig(true);
                    try {
                      await onOpslaan(updatedForm);
                      const rec = await onReExtract(updatedForm.id);
                      if (rec) setForm(rec);
                    } finally {
                      setExtractBezig(false);
                    }
                  }
                }}>
                <option value="factuur">📄 Factuur</option>
                <option value="bestelbevestiging">🛒 Bestelbevestiging</option>
                <option value="inzetbevestiging">🚗 Inzetbevestiging</option>
                <option value="autokosten">🔧 Autokosten</option>
              </select>
            </div>

            {/* ── FACTUUR ── */}
            {dt === 'factuur' && (
              <>
                <div className={styles.sectieKop}>Factuur</div>
                <div className={styles.fg}>
                  <label>Factuurnummer</label>
                  <input className="fi" value={form.factuurnummer ?? ''}
                    onChange={(e) => stel('factuurnummer', e.target.value)} />
                </div>
                <div className={styles.fg}>
                  <label>Factuurdatum</label>
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
                <SectieKenteken form={form} stel={stel} rdwOphalen={rdwOphalen} rdwBezig={rdwBezig} />
                <SectieKlant form={form} stel={stel} isBedrijf={isBedrijf} kvkOphalen={kvkOphalen} kvkBezig={kvkBezig} />
              </>
            )}

            {/* ── BESTELBEVESTIGING ── */}
            {dt === 'bestelbevestiging' && (
              <>
                <SectieContract form={form} stel={stel} />
                <SectieKlantLease form={form} stel={stel} kvkOphalen={kvkOphalen} kvkBezig={kvkBezig} />
              </>
            )}

            {/* ── INZETBEVESTIGING ── */}
            {dt === 'inzetbevestiging' && (
              <>
                <div className={styles.sectieKop}>Inzet</div>
                <SectieKenteken form={form} stel={stel} rdwOphalen={rdwOphalen} rdwBezig={rdwBezig} />
                <div className={`${styles.fg} ${styles.vol}`}>
                  <label>Contractnummer *</label>
                  <input className="fi" placeholder="1860533" value={form.contractnummer ?? ''}
                    onChange={(e) => stel('contractnummer', e.target.value)} />
                </div>
                <div className={styles.fg}>
                  <label>Inzetdatum</label>
                  <input className="fi" type="date" value={form.inzetdatum ?? ''}
                    onChange={(e) => stel('inzetdatum', e.target.value)} />
                </div>
                <div className={styles.fg}>
                  <label>Merk / Model</label>
                  <input className="fi" placeholder="Tesla Model 3" value={form.merk_model ?? ''}
                    onChange={(e) => stel('merk_model', e.target.value)} />
                </div>
                <div className={styles.fg}>
                  <label>Looptijd (mnd)</label>
                  <input className="fi" type="number" value={form.looptijd_maanden ?? ''}
                    onChange={(e) => stel('looptijd_maanden', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div className={styles.fg}>
                  <label>Jaarkilometrage</label>
                  <input className="fi" type="number" value={form.jaarkilometrage ?? ''}
                    onChange={(e) => stel('jaarkilometrage', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div className={`${styles.fg} ${styles.vol}`}>
                  <label>Leasemaatschappij</label>
                  <input className="fi" value={form.leasemaatschappij ?? ''}
                    onChange={(e) => stel('leasemaatschappij', e.target.value)} />
                </div>
                <SectieKlantLease form={form} stel={stel} kvkOphalen={kvkOphalen} kvkBezig={kvkBezig} />
              </>
            )}

            {/* ── AUTOKOSTEN ── */}
            {dt === 'autokosten' && (
              <>
                <div className={styles.sectieKop}>Auto</div>
                <SectieKenteken form={form} stel={stel} rdwOphalen={rdwOphalen} rdwBezig={rdwBezig} />
                <div className={styles.sectieKop}>Werkplaatsfactuur</div>
                <div className={`${styles.fg} ${styles.vol}`}>
                  <label>Garage / Leverancier</label>
                  <input className="fi" value={form.bedrijfsnaam ?? ''}
                    onChange={(e) => stel('bedrijfsnaam', e.target.value)} />
                </div>
                <div className={styles.fg}>
                  <label>Factuurdatum</label>
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
              </>
            )}

            {/* Notitie — altijd */}
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
            disabled={bezig || !isKlaar}
            title={isKlaar ? 'Wegschrijven naar HubSpot' : klaarHint()}
          >
            {bezig ? '...' : '✅ Goedkeuren → HubSpot'}
          </button>
        </div>
      </div>
    </div>
    {matchSuggesties && (
      <MatchBevestigModal
        suggesties={matchSuggesties}
        onBevestig={bevestigMatch}
        onAnnuleer={() => { setMatchSuggesties(null); setBezig(false); }}
      />
    )}
    </>
  );
}
