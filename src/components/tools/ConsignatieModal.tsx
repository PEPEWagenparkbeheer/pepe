'use client';

import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import { authHeaders } from '@/lib/clientAuth';
import styles from './ConsignatieModal.module.css';

interface Props {
  open: boolean;
  onSluiten: () => void;
  // Open direct op het inkoopverklaring-scherm (los van de consignatie-wizard)
  directInkoop?: boolean;
}

type KentekenType = 'personenauto' | 'bedrijfswagen';

// ─── Consignatie eindafrekening ────────────────────────────────
interface Form {
  auto: string;
  kentekenType: KentekenType;
  verkoopprijs: string;
  garantie: string;
  poetsen: string;
  tanken: string;
  advDagen: string;
  rijklaar: string;
  accessoires: string;
  feePercent: string;
}

const LEEG: Form = {
  auto: '',
  kentekenType: 'personenauto',
  verkoopprijs: '',
  garantie: '',
  poetsen: '',
  tanken: '',
  advDagen: '',
  rijklaar: '',
  accessoires: '',
  feePercent: '4',
};

// ─── Inkoopverklaring (marge) — losgekoppeld document ──────────
interface InkoopForm {
  merk: string;
  model: string;
  kenteken: string;
  bouwjaar: string;       // datum deel 1a (dd-mm-jjjj)
  brandstof: string;
  vermogen: string;       // bv. "96 kW · 131 PK"
  motorinhoud: string;    // bv. "1.199 cm³"
  kilometerstand: string;
  inkoopbedrag: string;
  opmerkingen: string;
  verkoperNaam: string;
  verkoperStraat: string;
  verkoperPostcode: string;
  verkoperPlaats: string;
  verkoperTelefoon: string;
  verkoperEmail: string;
  inkoperEmail: string;
}

const INKOOP_LEEG: InkoopForm = {
  merk: '',
  model: '',
  kenteken: '',
  bouwjaar: '',
  brandstof: '',
  vermogen: '',
  motorinhoud: '',
  kilometerstand: '',
  inkoopbedrag: '',
  opmerkingen: '',
  verkoperNaam: '',
  verkoperStraat: '',
  verkoperPostcode: '',
  verkoperPlaats: '',
  verkoperTelefoon: '',
  verkoperEmail: '',
  inkoperEmail: '',
};

interface SavedInkoop extends InkoopForm {
  id: string;
  nummer?: string;
  createdAt: string;
  docusignEnvelopeId?: string;
  docusignStatus?: string;
  docusignSentAt?: string;
}

// Antwoord van /api/consignatie/hubspot
interface HubSpotNaw {
  gevonden?: boolean;
  naam?: string;
  straat?: string;
  postcode?: string;
  plaats?: string;
  telefoon?: string;
  email?: string;
}

const STORAGE_KEY = 'pepe_inkoopfacturen';
const SEQ_KEY = 'pepe_inkoop_volgnr';

const BTW = 0.21;

// Inkoopverklaringen starten per jaar op nummer 2001, zodat ze nooit botsen met
// de facturen-nummering (die op 0001 begint). Teller loopt op en nooit terug
// (ook niet na verwijderen), reset per jaar naar 2001. Opgeslagen in localStorage.
const SEQ_START = 2001;

function nextInkoopNummer(): string {
  const jaar = new Date().getFullYear();
  let laatste = 0;
  try {
    const raw = localStorage.getItem(SEQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as { jaar: number; volgnr: number }) : null;
    laatste = parsed && parsed.jaar === jaar ? parsed.volgnr : 0;
  } catch {
    laatste = 0;
  }
  // Floor op SEQ_START: een leeg/nieuw jaar of een oude lage testteller
  // springt meteen naar 2001; daarna gewoon +1.
  const volgnr = Math.max(laatste + 1, SEQ_START);
  try {
    localStorage.setItem(SEQ_KEY, JSON.stringify({ jaar, volgnr }));
  } catch {
    // fail silently
  }
  return `${jaar}-${String(volgnr).padStart(4, '0')}`;
}

// Leesbare DocuSign-status voor in de app.
function statusLabel(s?: string): string {
  switch (s) {
    case 'completed': return '✓ Voltooid · verstuurd naar boekhouder';
    case 'sent': return 'Verstuurd · wacht op ondertekening';
    case 'delivered': return 'Geopend door ondertekenaar';
    case 'declined': return 'Afgewezen';
    case 'voided': return 'Geannuleerd';
    default: return s ? `Status: ${s}` : '';
  }
}

const STAPPEN = [
  { key: 'auto',         label: 'Auto' },
  { key: 'garantie',     label: 'Garantie' },
  { key: 'poetsen',      label: 'Poetsen' },
  { key: 'tanken',       label: 'Tanken' },
  { key: 'advertentie',  label: 'Advert.' },
  { key: 'rijklaar',     label: 'Rijklaar' },
  { key: 'accessoires',  label: 'Access.' },
  { key: 'fee',          label: 'Fee' },
];

function parseG(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── RDW helpers ───────────────────────────────────────────────
function titelCase(s?: string): string {
  if (!s) return '';
  return s.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

function formatRdwDatum(s?: string): string {
  if (!s || s.length < 8) return '';
  return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
}

// Haalt voertuiggegevens op uit het open RDW-register (geen key nodig).
async function rdwInkoopOphalen(kenteken: string): Promise<Partial<InkoopForm> | null> {
  const k = kenteken.replace(/[-\s]/g, '').toUpperCase();
  if (!k) return null;
  try {
    const [vRes, fRes] = await Promise.all([
      fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${k}`),
      fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${k}`),
    ]);
    const [vArr, fArr] = await Promise.all([vRes.json(), fRes.json()]);
    const v = Array.isArray(vArr) ? vArr[0] : undefined;
    if (!v) return null;

    // Brandstof-tabel kan meerdere rijen hebben (bv. hybride = benzine + elektrisch).
    const fuelRows: Record<string, string>[] = Array.isArray(fArr) ? fArr : [];
    const brandstofNamen = [...new Set(fuelRows.map((r) => titelCase(r.brandstof_omschrijving)).filter(Boolean))];

    // Vermogen: voor verbrandingsmotoren staat het in nettomaximumvermogen; voor EV's is dat
    // veld leeg en zit het piekvermogen in netto_max_vermogen_elektrisch (continu = nominaal).
    let kW = 0;
    for (const r of fuelRows) {
      const cand =
        Number(r.nettomaximumvermogen) ||
        Number(r.netto_max_vermogen_elektrisch) ||
        Number(r.nominaal_continu_maximumvermogen) ||
        0;
      if (cand > kW) kW = cand;
    }

    const motor = v.cilinderinhoud ? Number(v.cilinderinhoud) : 0;

    return {
      merk: titelCase(v.merk),
      model: titelCase(v.handelsbenaming),
      bouwjaar: formatRdwDatum(v.datum_eerste_toelating),
      brandstof: brandstofNamen.join(' / '),
      motorinhoud: motor ? `${motor.toLocaleString('nl-NL')} cm³` : '',
      vermogen: kW ? `${Math.round(kW)} kW · ${Math.round(kW * 1.36)} PK` : '',
    };
  } catch {
    return null;
  }
}

// Laad witte PEPE-logo SVG, render naar high-res PNG voor crisp PDF embedding
async function loadWitLogoAsPng(): Promise<{ data: string; aspect: number } | null> {
  try {
    const res = await fetch('/pepe-logo-cmyk-wit.svg');
    let svgText = await res.text();

    let aspect = 4;
    const vb = svgText.match(/viewBox=["']([\d.\-\s]+)["']/);
    if (vb) {
      const parts = vb[1].split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) aspect = parts[2] / parts[3];
    }

    if (!/<svg[^>]*\swidth=/.test(svgText)) {
      const targetW = 1200;
      const targetH = Math.round(targetW / aspect);
      svgText = svgText.replace(/<svg/, `<svg width="${targetW}" height="${targetH}"`);
    }

    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = Math.round(1600 / aspect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return { data: canvas.toDataURL('image/png'), aspect };
  } catch {
    return null;
  }
}

// Laad het kleuren-logo (voor witte documenten zoals de inkoopverklaring)
async function loadRgbLogoAsPng(): Promise<{ data: string; aspect: number } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = '/pepe-logo-rgb.png';
    });
    const w = img.naturalWidth || 1200;
    const h = img.naturalHeight || 300;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL('image/png'), aspect: w / h };
  } catch {
    return null;
  }
}

// Gedeelde PEPE-header (zwarte band) — geeft start-y terug
function drawPepeHeader(doc: jsPDF, titel: string, witLogo: { data: string; aspect: number } | null): number {
  const W = 210;
  const margin = 18;
  const col2 = W - margin;

  doc.setFillColor(15, 18, 24);
  doc.rect(0, 0, W, 30, 'F');

  if (witLogo) {
    const targetH = 12;
    const targetW = targetH * witLogo.aspect;
    doc.addImage(witLogo.data, 'PNG', margin, 9, targetW, targetH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('PEPE®', margin, 18);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(220, 60, 90);
  doc.text(titel, col2, 14, { align: 'right' });

  const datum = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 188, 200);
  doc.text(datum, col2, 21, { align: 'right' });

  doc.setFillColor(146, 25, 57);
  doc.rect(0, 30, W, 0.6, 'F');

  return 30.6;
}

// Gedeelde PEPE-footer
function drawPepeFooter(doc: jsPDF): void {
  const W = 210;
  const margin = 18;
  const col2 = W - margin;
  const y = 283;

  doc.setDrawColor(15, 18, 24);
  doc.setLineWidth(0.3);
  doc.line(margin, y, col2, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 18, 24);
  doc.text('PEPE®  WAGENPARKBEHEER', margin, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 168, 178);
  doc.text('pepewagenparkbeheer.nl', col2, y + 5.5, { align: 'right' });
}

export default function ConsignatieModal({ open, onSluiten, directInkoop = false }: Props) {
  const [form, setForm] = useState<Form>(LEEG);
  const [stap, setStap] = useState(0);
  const [klaar, setKlaar] = useState(false);

  // Inkoopverklaring — losgekoppelde flow vanaf het resultaatscherm
  const [toonInkoop, setToonInkoop] = useState(false);
  const [inkoop, setInkoop] = useState<InkoopForm>(INKOOP_LEEG);
  // Eén documentnummer per verklaring; lazy toegekend en overal (download,
  // opslaan, DocuSign) hergebruikt zodat het PDF-, bestands- en mailnummer gelijk zijn.
  const [inkoopNummer, setInkoopNummer] = useState<string | null>(null);
  const [savedInkoop, setSavedInkoop] = useState<SavedInkoop[]>([]);

  // Geeft het huidige documentnummer terug, of kent er één toe als dat nog niet bestaat.
  function ensureInkoopNummer(): string {
    if (inkoopNummer) return inkoopNummer;
    const nummer = nextInkoopNummer();
    setInkoopNummer(nummer);
    return nummer;
  }
  const [showSavedList, setShowSavedList] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [statusCheckId, setStatusCheckId] = useState<string | null>(null);
  const [rdwLoading, setRdwLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ envelopeId: string; status: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let saved: SavedInkoop[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : [];
    } catch {
      saved = [];
    }
    setSavedInkoop(saved);
    // Standalone-tegel: meteen het inkoopverklaring-scherm tonen
    if (directInkoop) {
      setKlaar(true);
      setToonInkoop(true);
    }
    // Status van openstaande envelopes verversen (zodat 'voltooid' vanzelf verschijnt)
    void refreshPendingStatuses(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, directInkoop]);

  // Ververst de DocuSign-status van nog niet-afgeronde verklaringen en bewaart het resultaat.
  async function refreshPendingStatuses(records: SavedInkoop[]) {
    const finaal = new Set(['completed', 'declined', 'voided']);
    const pending = records.filter(
      (r) => r.docusignEnvelopeId && !finaal.has(r.docusignStatus ?? ''),
    );
    if (pending.length === 0) return;

    const updates = await Promise.all(
      pending.map(async (r) => {
        try {
          const res = await fetch(`/api/consignatie/docusign/status?envelopeId=${encodeURIComponent(r.docusignEnvelopeId!)}`);
          const j = (await res.json()) as { ok?: boolean; status?: string };
          return res.ok && j.ok && j.status ? { id: r.id, status: j.status } : null;
        } catch {
          return null;
        }
      }),
    );

    const map = new Map(updates.filter(Boolean).map((u) => [u!.id, u!.status]));
    if (map.size === 0) return;
    setSavedInkoop((prev) => {
      const next = prev.map((r) => (map.has(r.id) ? { ...r, docusignStatus: map.get(r.id)! } : r));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // fail silently
      }
      return next;
    });
  }

  async function checkSavedStatus(id: string) {
    const record = savedInkoop.find((item) => item.id === id);
    if (!record?.docusignEnvelopeId) {
      return alert('Deze verklaring is nog niet via DocuSign verstuurd.');
    }
    setStatusCheckId(id);
    try {
      const res = await fetch(`/api/consignatie/docusign/status?envelopeId=${encodeURIComponent(record.docusignEnvelopeId)}`);
      const j = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok || !j.ok || !j.status) throw new Error(j.error || 'Status ophalen mislukt');
      persistSavedInkoop(savedInkoop.map((r) => (r.id === id ? { ...r, docusignStatus: j.status } : r)));
    } catch (err) {
      alert(`Status ophalen mislukt: ${err instanceof Error ? err.message : 'fout'}`);
    } finally {
      setStatusCheckId(null);
    }
  }

  function stel<K extends keyof Form>(veld: K, w: Form[K]) {
    setForm((f) => ({ ...f, [veld]: w }));
  }

  function stelInkoop<K extends keyof InkoopForm>(veld: K, w: InkoopForm[K]) {
    setInkoop((f) => ({ ...f, [veld]: w }));
  }

  function persistSavedInkoop(entries: SavedInkoop[]) {
    setSavedInkoop(entries);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // fail silently
    }
  }

  const cijfers = useMemo(() => {
    const factor = form.kentekenType === 'personenauto' ? 1 + BTW : 1;
    const isIncl = form.kentekenType === 'personenauto';

    const vp = parseG(form.verkoopprijs);
    const dagen = parseInt(form.advDagen) || 0;
    const maanden = dagen === 0 ? 0 : Math.ceil(dagen / 30.44);

    const garantieEx = parseG(form.garantie);
    const poetsenEx = parseG(form.poetsen);
    const tankenEx = parseG(form.tanken);
    const advEx = maanden * 25;
    const rijklaarEx = parseG(form.rijklaar);
    const accessoiresEx = parseG(form.accessoires);

    const garantie = garantieEx * factor;
    const poetsen = poetsenEx * factor;
    const tanken = tankenEx * factor;
    const adv = advEx * factor;
    const rijklaar = rijklaarEx * factor;
    const accessoires = accessoiresEx * factor;

    const feeP = parseG(form.feePercent);
    const fee = vp * feeP / 100;
    const totaal = vp - garantie - poetsen - tanken - adv - rijklaar - accessoires - fee;

    return {
      vp, dagen, maanden,
      garantie, poetsen, tanken, adv, rijklaar, accessoires,
      garantieEx, poetsenEx, tankenEx, advEx, rijklaarEx, accessoiresEx,
      feeP, fee, totaal,
      factor, isIncl,
    };
  }, [form]);

  function volgende() {
    if (stap === 0) {
      if (!form.auto.trim()) return alert('Vul een auto-naam of kenteken in.');
      if (cijfers.vp <= 0) return alert('Vul een verkoopprijs in.');
    }
    if (stap < STAPPEN.length - 1) {
      setStap(stap + 1);
    } else {
      setKlaar(true);
    }
  }

  function vorige() {
    setStap(Math.max(0, stap - 1));
  }

  function reset() {
    setForm(LEEG);
    setStap(0);
    setKlaar(false);
    setToonInkoop(false);
    setInkoop(INKOOP_LEEG);
    setInkoopNummer(null);
    setSendResult(null);
  }

  function handleSluiten() {
    reset();
    onSluiten();
  }

  // ─── Consignatie eindafrekening PDF ──────────────────────────
  async function createPdfDocument(): Promise<jsPDF> {
    const witLogo = await loadWitLogoAsPng();

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const margin = 18;
    const col2 = W - margin;

    let y = drawPepeHeader(doc, 'CONSIGNATIE · EINDAFREKENING', witLogo);

    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 25, 57);
    doc.text('EINDAFREKENING VOOR KLANT', margin, y);

    y += 11;
    doc.setFontSize(28);
    doc.setTextColor(15, 18, 24);
    doc.text(form.auto.toUpperCase(), margin, y);

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(122, 132, 144);
    doc.text(
      cijfers.isIncl ? 'Personenauto · alle bedragen incl. btw/bpm' : 'Bedrijfswagen · alle bedragen zijn excl. btw',
      margin, y
    );

    y += 9;
    doc.setDrawColor(232, 232, 236);
    doc.setLineWidth(0.3);
    doc.line(margin, y, col2, y);
    y += 8;

    const vpLbl = cijfers.isIncl ? 'Verkoopprijs (incl. btw/bpm)' : 'Verkoopprijs (excl. btw)';
    const regels: { lbl: string; val: number; type: 'pos' | 'neg' | 'zero' }[] = [
      { lbl: vpLbl, val: cijfers.vp, type: 'pos' },
      { lbl: 'Garantie / herstelkosten', val: cijfers.garantie, type: cijfers.garantie ? 'neg' : 'zero' },
      { lbl: 'Poetsen', val: cijfers.poetsen, type: cijfers.poetsen ? 'neg' : 'zero' },
      { lbl: 'Tanken', val: cijfers.tanken, type: cijfers.tanken ? 'neg' : 'zero' },
      { lbl: `Advertentiekosten (${cijfers.maanden} mnd × €25)`, val: cijfers.adv, type: cijfers.adv ? 'neg' : 'zero' },
      { lbl: 'Rijklaar maken + keuring', val: cijfers.rijklaar, type: cijfers.rijklaar ? 'neg' : 'zero' },
      { lbl: 'Accessoires', val: cijfers.accessoires, type: cijfers.accessoires ? 'neg' : 'zero' },
      { lbl: `PEPE commissie ${cijfers.feeP}%`, val: cijfers.fee, type: cijfers.fee ? 'neg' : 'zero' },
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 25, 57);
    doc.text('SPECIFICATIE', margin, y);
    y += 6;

    regels.forEach((r, i) => {
      const pfx = r.type === 'zero' ? '' : r.type === 'pos' ? '+ ' : '− ';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      if (r.type === 'zero') doc.setTextColor(190, 192, 198);
      else doc.setTextColor(75, 82, 92);
      doc.text(r.lbl, margin, y + 5.5);

      doc.setFont('helvetica', 'bold');
      if (r.type === 'pos') doc.setTextColor(15, 18, 24);
      else if (r.type === 'zero') doc.setTextColor(190, 192, 198);
      else doc.setTextColor(15, 18, 24);
      doc.text(`${pfx}€ ${fmtEuro(r.val)}`, col2, y + 5.5, { align: 'right' });

      doc.setDrawColor(238, 238, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 10, col2, y + 10);

      if (i === 0) {
        doc.setDrawColor(15, 18, 24);
        doc.setLineWidth(0.4);
        doc.line(margin, y + 10, col2, y + 10);
      }
      y += 11.5;
    });

    y += 8;
    doc.setFillColor(15, 18, 24);
    doc.rect(margin - 4, y, W - 2 * (margin - 4), 24, 'F');
    doc.setFillColor(146, 25, 57);
    doc.rect(margin - 4, y, 3, 24, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(220, 60, 90);
    doc.text('NETTO OPBRENGST KLANT', margin + 2, y + 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(`€ ${fmtEuro(cijfers.totaal)}`, col2, y + 16, { align: 'right' });
    y += 24;

    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 148, 158);
    const toelichting = cijfers.isIncl
      ? 'Kosten zijn omgerekend van excl btw naar incl btw (×1,21) zodat alle bedragen in dezelfde basis staan.'
      : 'Bedrijfswagen — alle bedragen zijn excl btw.';
    doc.text(toelichting, margin, y, { maxWidth: W - 2 * margin });

    drawPepeFooter(doc);
    return doc;
  }

  async function downloadPDF() {
    const doc = await createPdfDocument();
    const safe = form.auto.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim().replace(/\s+/g, '-');
    doc.save(`PEPE-Eindafrekening-${safe}.pdf`);
  }

  // ─── Inkoopverklaring PDF (premium ontwerp) ──────────────────
  async function createInkoopPdf(data: InkoopForm & { nummer?: string }): Promise<jsPDF> {
    const logo = await loadRgbLogoAsPng();

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const mL = 16;
    const col2 = W - 16;
    const cw = col2 - mL;

    const BURG: [number, number, number] = [149, 23, 48];
    const INK: [number, number, number] = [35, 38, 43];
    const MUT: [number, number, number] = [107, 110, 115];
    const SOFT: [number, number, number] = [139, 142, 147];
    const LINE: [number, number, number] = [208, 208, 212];
    const PH: [number, number, number] = [182, 183, 187];
    const TINT: [number, number, number] = [250, 247, 248];

    const carName = [data.merk, data.model].filter(Boolean).join(' ').trim() || data.merk || '—';

    // ── Header ──
    if (logo) {
      const h = 9;
      doc.addImage(logo.data, 'PNG', mL, 11, h * logo.aspect, h);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...BURG);
      doc.text('PEPE®', mL, 19);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text('INKOOPVERKLARING', col2, 16, { align: 'right', charSpace: 0.5 });

    const datum = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nr = data.nummer || nextInkoopNummer();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(`Nº ${nr}   ·   Datum ${datum}`, col2, 21.5, { align: 'right' });

    doc.setFillColor(...BURG);
    doc.rect(mL, 26, cw, 0.9, 'F');

    // ── Partijen ──
    let y = 35;
    const leftX = mL;
    const rightX = 110;
    const leftW = 84;
    const rightW = col2 - rightX;

    const veld = (x: number, yy: number, w: number, label: string, value?: string, ph?: string): number => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...SOFT);
      doc.text(label.toUpperCase(), x, yy, { charSpace: 0.4 });
      const txt = value && value.trim() ? value : (ph || '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      if (value && value.trim()) doc.setTextColor(...INK);
      else doc.setTextColor(...PH);
      doc.text(txt, x, yy + 4.5, { maxWidth: w });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(x, yy + 6.6, x + w, yy + 6.6);
      return yy + 12;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BURG);
    doc.text('VERKOPER', leftX, y, { charSpace: 0.6 });
    doc.text('INKOPER', rightX, y, { charSpace: 0.6 });

    let ly = y + 6;
    let ry = y + 6;
    ly = veld(leftX, ly, leftW, 'Naam', data.verkoperNaam, 'Naam verkoper');
    ly = veld(leftX, ly, leftW, 'Adres', data.verkoperStraat, 'Straat en huisnummer');
    ly = veld(leftX, ly, leftW, 'Postcode / woonplaats', `${data.verkoperPostcode} ${data.verkoperPlaats}`.trim(), 'Postcode en plaats');
    ly = veld(leftX, ly, leftW, 'E-mail', data.verkoperEmail, 'naam@email.nl');

    ry = veld(rightX, ry, rightW, 'Bedrijf', 'PEPE Wagenparkbeheer');
    ry = veld(rightX, ry, rightW, 'Adres', 'De Gorzen 19, 4731 TV Oudenbosch');
    ry = veld(rightX, ry, rightW, 'Telefoon', '0165 794 100');
    ry = veld(rightX, ry, rightW, 'E-mail', 'info@pepewagenparkbeheer.nl');

    y = Math.max(ly, ry) + 3;

    // ── Voertuigband ──
    const bandH = 46;
    doc.setFillColor(...TINT);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(mL, y, cw, bandH, 'FD');

    const bx = mL + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...INK);
    doc.text(carName, bx, y + 11, { maxWidth: 80 });

    // Kentekenplaat
    const plateY = y + 16;
    const plateH = 10;
    const blueW = 6.5;
    const kenteken = data.kenteken || '—';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const nrW = doc.getTextWidth(kenteken);
    const plateW = blueW + 5 + nrW + 5;
    doc.setFillColor(242, 202, 0);
    doc.setDrawColor(21, 23, 28);
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, plateY, plateW, plateH, 1.4, 1.4, 'FD');
    doc.setFillColor(10, 45, 180);
    doc.rect(bx + 0.6, plateY + 0.6, blueW, plateH - 1.2, 'F');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.text('NL', bx + 0.6 + blueW / 2, plateY + plateH - 2.2, { align: 'center' });
    doc.setFontSize(13);
    doc.setTextColor(21, 23, 28);
    doc.text(kenteken, bx + blueW + 5, plateY + plateH - 2.8);

    // Chips (RDW-data) — 2 kolommen rechts in de band
    const chips: [string, string][] = ([
      ['Bouwjaar (deel 1a)', data.bouwjaar],
      ['Brandstof', data.brandstof],
      ['Vermogen', data.vermogen],
      ['Motorinhoud', data.motorinhoud],
      ['Kilometerstand', data.kilometerstand ? `${Number(data.kilometerstand).toLocaleString('nl-NL')} km` : ''],
    ] as [string, string][]).filter(([, v]) => v && v.trim());

    const chipX0 = mL + 96;
    const chipColW = 41;
    chips.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = chipX0 + col * chipColW;
      const cy = y + 10 + row * 11;
      doc.setFillColor(...BURG);
      doc.rect(cx, cy - 3, 0.8, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...SOFT);
      doc.text(label.toUpperCase(), cx + 2.5, cy, { charSpace: 0.2 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(value, cx + 2.5, cy + 4.2, { maxWidth: chipColW - 4 });
    });

    y += bandH + 8;

    // ── Inkoop (marge + bedrag) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('INKOOP', mL, y, { charSpace: 0.5 });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(mL + 16, y - 1, col2, y - 1);
    y += 5;

    const boxH = 30;
    const leftBoxW = 90;
    const rightBoxX = mL + 96;
    const rightBoxW = col2 - rightBoxX;

    // Margeregeling
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(mL, y, leftBoxW, boxH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...BURG);
    doc.text('MARGEREGELING', mL + 4, y + 6, { charSpace: 0.4 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(
      'Dit voertuig is ingekocht onder de margeregeling. De btw is niet apart vermeld en niet aftrekbaar.',
      mL + 4, y + 11.5, { maxWidth: leftBoxW - 8, lineHeightFactor: 1.4 }
    );
    doc.text(
      'Ondergetekende verklaart eigenaar te zijn en draagt het voertuig vrij van rechten van derden over.',
      mL + 4, y + 22, { maxWidth: leftBoxW - 8, lineHeightFactor: 1.4 }
    );

    // Inkoopbedrag
    const bedrag = `€ ${fmtEuro(parseG(data.inkoopbedrag))}`;
    doc.setDrawColor(...LINE);
    doc.rect(rightBoxX, y, rightBoxW, boxH);
    doc.setFillColor(...INK);
    doc.rect(rightBoxX, y, rightBoxW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('INKOOPBEDRAG', rightBoxX + 4, y + 4.8, { charSpace: 0.4 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUT);
    doc.text(carName, rightBoxX + 4, y + 14, { maxWidth: rightBoxW - 36 });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(bedrag, rightBoxX + rightBoxW - 4, y + 14, { align: 'right' });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(rightBoxX + 4, y + 18.5, rightBoxX + rightBoxW - 4, y + 18.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text('TOTAAL', rightBoxX + 4, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUT);
    doc.text('onder margeregeling', rightBoxX + 4, y + 27.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...BURG);
    doc.text(bedrag, rightBoxX + rightBoxW - 4, y + 26, { align: 'right' });

    y += boxH + 8;

    // ── Opmerkingen (optioneel) ──
    if (data.opmerkingen && data.opmerkingen.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text('OPMERKINGEN', mL, y, { charSpace: 0.5 });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(mL + 26, y - 1, col2, y - 1);
      y += 4;
      const opmH = 16;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.rect(mL, y, cw, opmH);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(data.opmerkingen, mL + 4, y + 5.5, { maxWidth: cw - 8, lineHeightFactor: 1.4 });
      y += opmH + 8;
    }

    // ── Verklaring ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(
      'Door ondertekening verklaart de verkoper het voertuig in eigendom te hebben en vrij van verplichtingen over te dragen aan PEPE Wagenparkbeheer.',
      mL, y, { maxWidth: cw, lineHeightFactor: 1.45 }
    );
    y += 12;

    // ── Ondertekening (met DocuSign-ankers \s1\ en \s2\) ──
    const sigW = (cw - 12) / 2;
    const sigBoxH = 22;
    const ix = mL + sigW + 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BURG);
    doc.text('VERKOPER', mL, y, { charSpace: 0.5 });
    doc.text('INKOPER (PEPE)', ix, y, { charSpace: 0.5 });

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(mL, y + 2, sigW, sigBoxH);
    doc.rect(ix, y + 2, sigW, sigBoxH);

    // Ankers — vrijwel onzichtbaar, leesbaar voor DocuSign
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(252, 252, 252);
    doc.text('\\s1\\', mL + 5, y + 2 + sigBoxH - 4);
    doc.text('\\s2\\', ix + 5, y + 2 + sigBoxH - 4);

    doc.setFontSize(7);
    doc.setTextColor(...MUT);
    doc.text('Naam / datum', mL, y + 2 + sigBoxH + 5);
    doc.text('Naam / datum', ix, y + 2 + sigBoxH + 5);

    // ── Footer ──
    const fy = 280;
    doc.setFillColor(...BURG);
    doc.rect(mL, fy, cw, 0.6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(
      'T 0165 794 100     E info@pepewagenparkbeheer.nl     W pepewagenparkbeheer.nl     A De Gorzen 19, 4731 TV Oudenbosch',
      W / 2, fy + 5, { align: 'center' }
    );
    doc.setTextColor(...MUT);
    doc.text(
      'KVK 88528502     BTW NL864670114B01     IBAN NL02INGB0106922696     BIC INGBNL2A',
      W / 2, fy + 9.5, { align: 'center' }
    );

    return doc;
  }

  async function downloadInkoopPdf() {
    const nummer = ensureInkoopNummer();
    const doc = await createInkoopPdf({ ...inkoop, nummer });
    const safe = (inkoop.merk || inkoop.kenteken || 'auto').replace(/[^a-zA-Z0-9\-_\s]/g, '').trim().replace(/\s+/g, '-');
    doc.save(`PEPE-Inkoopverklaring-${nummer}-${safe}.pdf`);
  }

  async function createInkoopPdfBase64(data: InkoopForm & { nummer?: string }): Promise<string> {
    const doc = await createInkoopPdf(data);
    // jsPDF geeft "data:application/pdf;filename=generated.pdf;base64,…" — knip alles
    // tot en met "base64," weg zodat we pure base64 overhouden (anders verwerpt DocuSign 't).
    const dataUri = doc.output('datauristring') as string;
    const marker = 'base64,';
    const idx = dataUri.indexOf(marker);
    return idx >= 0 ? dataUri.slice(idx + marker.length) : dataUri;
  }

  function openInkoopfactuur() {
    setInkoop((prev) => ({
      ...prev,
      merk: prev.merk || form.auto,
      inkoopbedrag: prev.inkoopbedrag || form.verkoopprijs,
    }));
    setInkoopNummer(null);
    setSendResult(null);
    setToonInkoop(true);
  }

  async function haalRdwInkoop() {
    if (!inkoop.kenteken.trim()) return alert('Vul eerst een kenteken in.');
    setRdwLoading(true);
    try {
      const [rdw, hs] = await Promise.all([
        rdwInkoopOphalen(inkoop.kenteken),
        fetch(`/api/consignatie/hubspot?kenteken=${encodeURIComponent(inkoop.kenteken)}`)
          .then((r) => r.json() as Promise<HubSpotNaw>)
          .catch((): HubSpotNaw => ({ gevonden: false })),
      ]);

      if (!rdw && !hs?.gevonden) {
        alert('Geen RDW- of HubSpot-gegevens gevonden voor dit kenteken.');
        return;
      }

      setInkoop((prev) => {
        const next: InkoopForm = { ...prev, ...(rdw ?? {}) };
        if (hs?.gevonden) {
          if (hs.naam) next.verkoperNaam = hs.naam;
          if (hs.straat) next.verkoperStraat = hs.straat;
          if (hs.postcode) next.verkoperPostcode = hs.postcode;
          if (hs.plaats) next.verkoperPlaats = hs.plaats;
          if (hs.telefoon) next.verkoperTelefoon = hs.telefoon;
          if (hs.email) next.verkoperEmail = hs.email;
        }
        return next;
      });

      if (!hs?.gevonden) {
        alert('Voertuig opgehaald uit RDW. Niet gevonden in HubSpot — vul de NAW-gegevens handmatig in.');
      }
    } catch {
      alert('Ophalen mislukt. Controleer het kenteken en je internetverbinding.');
    } finally {
      setRdwLoading(false);
    }
  }

  function saveInkoopfactuur() {
    if (!inkoop.kenteken.trim()) return alert('Vul het kenteken in voor de inkoopverklaring.');
    if (!inkoop.verkoperNaam.trim()) return alert('Vul de naam van de verkoper in.');

    const record: SavedInkoop = {
      ...inkoop,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      nummer: ensureInkoopNummer(),
      createdAt: new Date().toISOString(),
    };

    persistSavedInkoop([record, ...savedInkoop]);
    alert('Inkoopverklaring opgeslagen. Je kunt deze later terughalen en opnieuw via DocuSign aanbieden.');
  }

  function openSavedInkoop(id: string) {
    const record = savedInkoop.find((item) => item.id === id);
    if (!record) return;
    setInkoop({ ...INKOOP_LEEG, ...record });
    setInkoopNummer(record.nummer ?? null);
    setShowSavedList(false);
    setSendResult(null);
  }

  function deleteSavedInkoop(id: string) {
    if (!window.confirm('Weet je zeker dat je deze opgeslagen inkoopverklaring wilt verwijderen?')) return;
    persistSavedInkoop(savedInkoop.filter((item) => item.id !== id));
  }

  // Verstuurt een record naar DocuSign en geeft het resultaat terug.
  // Het documentnummer komt in de bestandsnaam + onderwerp zodat de boekhouder (Basecone)
  // het meekrijgt; ontbreekt het (los verzenden zonder opslaan), dan genereren we er één.
  async function postDocuSign(data: InkoopForm & { nummer?: string }): Promise<{ envelopeId: string; status: string }> {
    const nummer = data.nummer || nextInkoopNummer();
    const naam = [data.merk, data.model].filter(Boolean).join(' ').trim() || data.kenteken;
    const titel = `Inkoopverklaring ${nummer} — ${naam}`.trim();

    const pdfBase64 = await createInkoopPdfBase64({ ...data, nummer });
    const res = await fetch('/api/consignatie/docusign', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        pdfBase64,
        auto: naam,
        kenteken: data.kenteken,
        klantNaam: data.verkoperNaam,
        emailKlant: data.verkoperEmail,
        emailInkoper: data.inkoperEmail,
        documentNaam: titel,
        onderwerp: titel,
        bericht: `Onderteken inkoopverklaring ${nummer} voor het voertuig ${naam}.`,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Onbekende fout bij DocuSign');
    return { envelopeId: json.envelopeId, status: json.status };
  }

  async function sendInkoopToDocuSign() {
    if (!inkoop.verkoperEmail.trim()) return alert('Vul het e-mailadres van de verkoper in voor DocuSign.');
    if (!inkoop.inkoperEmail.trim()) return alert('Vul het e-mailadres van de inkoper in voor DocuSign.');
    if (!inkoop.kenteken.trim()) return alert('Vul het kenteken in voor DocuSign.');

    setIsSending(true);
    setSendResult(null);
    try {
      const result = await postDocuSign({ ...inkoop, nummer: ensureInkoopNummer() });
      setSendResult(result);
      alert(`DocuSign-verzoek verstuurd: ${result.envelopeId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      console.error('DocuSign fout:', message);
      alert(`DocuSign fout: ${message}`);
    } finally {
      setIsSending(false);
    }
  }

  async function sendSavedToDocuSign(id: string) {
    const record = savedInkoop.find((item) => item.id === id);
    if (!record) return;
    if (!record.verkoperEmail?.trim() || !record.inkoperEmail?.trim()) {
      return alert('Deze opgeslagen inkoopverklaring mist een e-mailadres. Open ’m, vul de e-mailadressen aan en sla opnieuw op.');
    }

    setSendingId(id);
    try {
      const result = await postDocuSign(record);
      const updated = savedInkoop.map((item) =>
        item.id === id
          ? { ...item, docusignEnvelopeId: result.envelopeId, docusignStatus: result.status, docusignSentAt: new Date().toISOString() }
          : item
      );
      persistSavedInkoop(updated);
      alert(`DocuSign-verzoek verstuurd: ${result.envelopeId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      console.error('DocuSign fout:', message);
      alert(`DocuSign fout: ${message}`);
    } finally {
      setSendingId(null);
    }
  }

  if (!open) return null;

  // ─── INKOOPVERKLARING-scherm (losgekoppeld) ──────────────────
  if (klaar && toonInkoop) {
    return (
      <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <div>
              <div className={styles.modalSub}>Marge · inkoop onder margeregeling</div>
              <div className={styles.modalTitel}>🧾 Inkoopverklaring</div>
            </div>
            <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
          </div>

          <div className={styles.modalBody}>
            {savedInkoop.length > 0 && (
              <div className={styles.savedBox}>
                <div className={styles.savedHeading}>
                  <div>
                    <div className={styles.savedTitle}>Opgeslagen inkoopverklaringen</div>
                    <div className={styles.savedMeta}>
                      {savedInkoop.length} record{savedInkoop.length === 1 ? '' : 's'} · opnieuw aanbieden in DocuSign mogelijk
                    </div>
                  </div>
                  <button className="btn btn-a" type="button" onClick={() => setShowSavedList((v) => !v)}>
                    {showSavedList ? 'Verberg' : 'Bekijk'}
                  </button>
                </div>
                {showSavedList && (
                  <div className={styles.savedList}>
                    {savedInkoop.map((item) => (
                      <div key={item.id} className={styles.savedItem}>
                        <div>
                          <strong>{[item.merk, item.model].filter(Boolean).join(' ') || item.kenteken || 'Onbekend voertuig'}</strong>
                          <div className={styles.savedMeta}>
                            {item.nummer && `${item.nummer} · `}{item.kenteken && `${item.kenteken} · `}{new Date(item.createdAt).toLocaleString('nl-NL')}
                          </div>
                          {item.docusignStatus && (
                            <div className={styles.savedMeta}>{statusLabel(item.docusignStatus)}</div>
                          )}
                        </div>
                        <div className={styles.savedActions}>
                          <button className="btn btn-a" type="button" onClick={() => openSavedInkoop(item.id)}>
                            Openen
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => sendSavedToDocuSign(item.id)}
                            disabled={sendingId === item.id}
                          >
                            {sendingId === item.id ? 'Versturen…' : '📤 DocuSign'}
                          </button>
                          {item.docusignEnvelopeId && (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => checkSavedStatus(item.id)}
                              disabled={statusCheckId === item.id}
                            >
                              {statusCheckId === item.id ? 'Checken…' : '🔄 Status'}
                            </button>
                          )}
                          <button className="btn" type="button" onClick={() => deleteSavedInkoop(item.id)}>
                            Verwijderen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.sectionHeading}>Voertuig</div>
            <div className={styles.fg}>
              <label>Kenteken</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  className="fi"
                  style={{ flex: 1 }}
                  placeholder="AB-123-C"
                  value={inkoop.kenteken}
                  onChange={(e) => stelInkoop('kenteken', e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="btn btn-a"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={haalRdwInkoop}
                  disabled={rdwLoading}
                >
                  {rdwLoading ? 'Ophalen…' : '📡 RDW + HubSpot'}
                </button>
              </div>
              <p className={styles.uitleg}>
                Haalt voertuiggegevens (merk/model, bouwjaar, brandstof, vermogen, motorinhoud) uit het RDW-register, én — als de auto in HubSpot staat — de NAW-gegevens van de verkoper.
              </p>
            </div>

            <div className={styles.rowGrid}>
              <div className={styles.fg}>
                <label>Merk</label>
                <input className="fi" placeholder="bijv. Peugeot" value={inkoop.merk} onChange={(e) => stelInkoop('merk', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>Model</label>
                <input className="fi" placeholder="bijv. 2008" value={inkoop.model} onChange={(e) => stelInkoop('model', e.target.value)} />
              </div>
            </div>
            <div className={styles.rowGrid}>
              <div className={styles.fg}>
                <label>Bouwjaar (datum deel 1a)</label>
                <input className="fi" placeholder="dd-mm-jjjj" value={inkoop.bouwjaar} onChange={(e) => stelInkoop('bouwjaar', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>Brandstof</label>
                <input className="fi" placeholder="Benzine" value={inkoop.brandstof} onChange={(e) => stelInkoop('brandstof', e.target.value)} />
              </div>
            </div>
            <div className={styles.rowGrid}>
              <div className={styles.fg}>
                <label>Vermogen</label>
                <input className="fi" placeholder="96 kW · 131 PK" value={inkoop.vermogen} onChange={(e) => stelInkoop('vermogen', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>Motorinhoud</label>
                <input className="fi" placeholder="1.199 cm³" value={inkoop.motorinhoud} onChange={(e) => stelInkoop('motorinhoud', e.target.value)} />
              </div>
            </div>
            <div className={styles.fg}>
              <label>Kilometerstand</label>
              <input className="fi" type="number" min={0} placeholder="123456" value={inkoop.kilometerstand} onChange={(e) => stelInkoop('kilometerstand', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Inkoopbedrag <span className={styles.btwBadge}>marge</span></label>
              <EuroInput value={inkoop.inkoopbedrag} onChange={(v) => stelInkoop('inkoopbedrag', v)} placeholder="0" />
            </div>
            <div className={styles.fg}>
              <label>Opmerkingen</label>
              <textarea
                className="fi"
                rows={2}
                placeholder="Eventuele afspraken of bijzonderheden…"
                value={inkoop.opmerkingen}
                onChange={(e) => stelInkoop('opmerkingen', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className={styles.sectionHeading}>Verkoper (NAW)</div>
            <div className={styles.fg}>
              <label>Naam</label>
              <input className="fi" placeholder="Naam verkoper" value={inkoop.verkoperNaam} onChange={(e) => stelInkoop('verkoperNaam', e.target.value)} />
            </div>
            <div className={styles.fg}>
              <label>Straat + huisnummer</label>
              <input className="fi" placeholder="Hoofdstraat 12" value={inkoop.verkoperStraat} onChange={(e) => stelInkoop('verkoperStraat', e.target.value)} />
            </div>
            <div className={styles.rowGrid}>
              <div className={styles.fg}>
                <label>Postcode</label>
                <input className="fi" placeholder="1234 AB" value={inkoop.verkoperPostcode} onChange={(e) => stelInkoop('verkoperPostcode', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>Plaats</label>
                <input className="fi" placeholder="Amsterdam" value={inkoop.verkoperPlaats} onChange={(e) => stelInkoop('verkoperPlaats', e.target.value)} />
              </div>
            </div>
            <div className={styles.rowGrid}>
              <div className={styles.fg}>
                <label>Telefoon</label>
                <input className="fi" placeholder="0612345678" value={inkoop.verkoperTelefoon} onChange={(e) => stelInkoop('verkoperTelefoon', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>E-mail verkoper</label>
                <input className="fi" type="email" placeholder="naam@example.com" value={inkoop.verkoperEmail} onChange={(e) => stelInkoop('verkoperEmail', e.target.value)} />
              </div>
            </div>

            <div className={styles.sectionHeading}>Digitaal ondertekenen</div>
            <div className={styles.savedBox} style={{ padding: '14px 16px' }}>
              <div className={styles.inkoopHeader}>
                <div>
                  <div className={styles.savedTitle}>Verstuur via DocuSign</div>
                  <div className={styles.savedMeta}>Stuur verkoper en inkoper een digitaal handtekeningverzoek.</div>
                </div>
                <button
                  className="btn btn-a"
                  type="button"
                  onClick={sendInkoopToDocuSign}
                  disabled={isSending || !inkoop.verkoperEmail.trim() || !inkoop.inkoperEmail.trim()}
                >
                  {isSending ? 'Versturen…' : 'Verstuur naar DocuSign'}
                </button>
              </div>
              <div className={styles.fg}>
                <label>E-mail inkoper</label>
                <input className="fi" type="email" placeholder="inkoper@example.com" value={inkoop.inkoperEmail} onChange={(e) => stelInkoop('inkoperEmail', e.target.value)} />
              </div>
              {sendResult && (
                <div className={styles.feeLive} style={{ marginTop: 8 }}>
                  <span>DocuSign status</span>
                  <strong>{sendResult.status} · {sendResult.envelopeId}</strong>
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalFooter}>
            {!directInkoop && (
              <button className="btn" onClick={() => setToonInkoop(false)}>← Terug naar afrekening</button>
            )}
            <button className="btn" onClick={saveInkoopfactuur}>💾 Opslaan</button>
            <button className="btn btn-a" onClick={downloadInkoopPdf}>⬇ Download inkoopverklaring</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RESULTAAT-scherm (consignatie eindafrekening) ───────────
  if (klaar) {
    const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const vpLbl = cijfers.isIncl ? 'Verkoopprijs (incl. btw/bpm)' : 'Verkoopprijs (excl. btw)';
    const regels = [
      { lbl: vpLbl, val: cijfers.vp, type: 'pos', sep: false },
      { lbl: 'Garantie / herstelkosten', val: cijfers.garantie, type: cijfers.garantie ? 'neg' : 'zero', sep: true },
      { lbl: 'Poetsen', val: cijfers.poetsen, type: cijfers.poetsen ? 'neg' : 'zero', sep: false },
      { lbl: 'Tanken', val: cijfers.tanken, type: cijfers.tanken ? 'neg' : 'zero', sep: false },
      { lbl: `Advertentie (${cijfers.maanden} mnd × €25)`, val: cijfers.adv, type: cijfers.adv ? 'neg' : 'zero', sep: false },
      { lbl: 'Rijklaar maken + keuring', val: cijfers.rijklaar, type: cijfers.rijklaar ? 'neg' : 'zero', sep: false },
      { lbl: 'Accessoires', val: cijfers.accessoires, type: cijfers.accessoires ? 'neg' : 'zero', sep: false },
      { lbl: `PEPE commissie ${cijfers.feeP}%`, val: cijfers.fee, type: cijfers.fee ? 'neg' : 'zero', sep: false },
    ] as const;

    return (
      <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <div>
              <div className={styles.modalSub}>Consignatie · {datum}</div>
              <div className={styles.modalTitel}>📋 Eindafrekening</div>
            </div>
            <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.hero}>
              <div className={styles.heroSub}>Eindafrekening voor klant</div>
              <div className={styles.heroAuto}>{form.auto || '—'}</div>
            </div>

            <div className={styles.regels}>
              {regels.map((r, i) => {
                const pfx = r.type === 'zero' ? '' : r.type === 'pos' ? '+ ' : '− ';
                const kleurCls = r.type === 'pos' ? styles.regelPos : r.type === 'neg' ? styles.regelNeg : styles.regelZero;
                return (
                  <div key={i} className={`${styles.regel} ${kleurCls} ${r.sep ? styles.regelSep : ''}`}>
                    <span className={styles.regelLbl}>{r.lbl}</span>
                    <span className={styles.regelVal}>{pfx}€ {fmtEuro(r.val)}</span>
                  </div>
                );
              })}
            </div>

            <div className={styles.totaal}>
              <span className={styles.totaalLbl}>Netto opbrengst klant</span>
              <span className={styles.totaalVal}>€ {fmtEuro(cijfers.totaal)}</span>
            </div>

            <p className={styles.uitleg} style={{ textAlign: 'center', marginTop: 4 }}>
              {cijfers.isIncl
                ? 'Kosten zijn omgerekend van excl btw naar incl btw (×1,21) zodat alle bedragen in dezelfde basis staan.'
                : 'Bedrijfswagen — alle bedragen zijn excl btw.'}
            </p>
          </div>

          <div className={styles.modalFooter}>
            <button className="btn" onClick={reset}>+ Nieuwe afrekening</button>
            <button className="btn btn-a" onClick={downloadPDF}>⬇ Download PDF</button>
            <button className="btn btn-a" onClick={openInkoopfactuur}>🧾 Maak inkoopverklaring</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── WIZARD-scherm ───────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalSub}>Tools · Stap {stap + 1} van {STAPPEN.length}</div>
            <div className={styles.modalTitel}>📋 Consignatie eindafrekening</div>
          </div>
          <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
        </div>

        <div className={styles.stepNav}>
          {STAPPEN.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`${styles.stepItem} ${i === stap ? styles.stepActief : ''} ${i < stap ? styles.stepDone : ''}`}
              onClick={() => setStap(i)}
              title={`Stap ${i + 1}: ${s.label}`}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>{s.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {stap === 0 && (
            <>
              <div className={styles.fg}>
                <label>Type kenteken</label>
                <div className={styles.chipGroep}>
                  <button
                    type="button"
                    className={`${styles.chip} ${form.kentekenType === 'personenauto' ? styles.chipActief : ''}`}
                    onClick={() => stel('kentekenType', 'personenauto')}
                  >🟨 Personenauto</button>
                  <button
                    type="button"
                    className={`${styles.chip} ${form.kentekenType === 'bedrijfswagen' ? styles.chipActief : ''}`}
                    onClick={() => stel('kentekenType', 'bedrijfswagen')}
                  >⬜ Bedrijfswagen (grijs)</button>
                </div>
                <p className={styles.uitleg}>
                  {form.kentekenType === 'personenauto'
                    ? 'Verkoopprijs is incl. btw/bpm; kosten worden ex btw ingevoerd en automatisch omgerekend naar incl btw in de eindrekening.'
                    : 'Alle bedragen zijn excl. btw — geen omrekening.'}
                </p>
              </div>
              <div className={styles.fg}>
                <label>Auto (merk, model of kenteken)</label>
                <input className="fi" placeholder="bijv. Tesla Model 3, AB-123-C" value={form.auto} onChange={(e) => stel('auto', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>
                  Verkoopprijs{' '}
                  <span className={form.kentekenType === 'personenauto' ? styles.btwBadge : styles.btwBadgeExcl}>
                    {form.kentekenType === 'personenauto' ? 'incl. btw / bpm' : 'excl. btw'}
                  </span>
                </label>
                <EuroInput value={form.verkoopprijs} onChange={(v) => stel('verkoopprijs', v)} placeholder="70000" />
              </div>
            </>
          )}

          {stap === 1 && (
            <div className={styles.fg}>
              <label>Garantie / herstelkosten <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.garantie} onChange={(v) => stel('garantie', v)} />
              <p className={styles.uitleg}>Kosten door garantieclaims of herstelwerk na de verkoop. Vul 0 in als niet van toepassing.</p>
            </div>
          )}

          {stap === 2 && (
            <div className={styles.fg}>
              <label>Kosten poetsen <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.poetsen} onChange={(v) => stel('poetsen', v)} />
              <p className={styles.uitleg}>Kosten voor het poetsen of reinigen van de auto.</p>
            </div>
          )}

          {stap === 3 && (
            <div className={styles.fg}>
              <label>Kosten tanken <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.tanken} onChange={(v) => stel('tanken', v)} />
              <p className={styles.uitleg}>Uitgegeven aan brandstof voor deze auto.</p>
            </div>
          )}

          {stap === 4 && (
            <>
              <div className={styles.fg}>
                <label>Dagen te koop gestaan</label>
                <div className={styles.inputWrap}>
                  <input
                    className="fi"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.advDagen}
                    onChange={(e) => stel('advDagen', e.target.value)}
                    style={{ paddingRight: 50 }}
                  />
                  <span className={styles.sfx}>dagen</span>
                </div>
                <p className={styles.uitleg}>Kosten zijn €25 per maand (naar boven afgerond, 30,44 dagen per maand).</p>
              </div>
              {cijfers.dagen > 0 && (
                <div className={styles.calcBox}>
                  <div className={styles.calcRow}><span>Aantal dagen</span><span>{cijfers.dagen}</span></div>
                  <div className={styles.calcRow}><span>Afgeronde maanden</span><span>{cijfers.maanden}</span></div>
                  <div className={`${styles.calcRow} ${styles.calcTotaal}`}><span>Advertentiekosten</span><span>€ {fmtEuro(cijfers.adv)}</span></div>
                </div>
              )}
            </>
          )}

          {stap === 5 && (
            <div className={styles.fg}>
              <label>Rijklaar maken + keuring <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.rijklaar} onChange={(v) => stel('rijklaar', v)} />
              <p className={styles.uitleg}>APK, kleine reparaties, banden of overige werkzaamheden.</p>
            </div>
          )}

          {stap === 6 && (
            <div className={styles.fg}>
              <label>Kosten accessoires <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.accessoires} onChange={(v) => stel('accessoires', v)} />
              <p className={styles.uitleg}>Extra accessoires (matten, trekhaak, dakdragers, etc.).</p>
            </div>
          )}

          {stap === 7 && (
            <>
              <div className={styles.fg}>
                <label>PEPE commissie</label>
                <div className={styles.inputWrap}>
                  <input
                    className="fi"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="4"
                    value={form.feePercent}
                    onChange={(e) => stel('feePercent', e.target.value)}
                    style={{ paddingRight: 28 }}
                  />
                  <span className={styles.sfx}>%</span>
                </div>
                <p className={styles.uitleg}>Welk percentage rekent PEPE als commissie over de verkoopprijs?</p>
              </div>
              <div className={styles.feeLive}>
                <span>Fee bedrag (over verkoopprijs)</span>
                <strong>€ {fmtEuro(cijfers.fee)}</strong>
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          {stap > 0 && <button className="btn" onClick={vorige}>← Terug</button>}
          <button className="btn btn-a" onClick={volgende}>
            {stap === STAPPEN.length - 1 ? 'Bereken afrekening →' : 'Volgende →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component voor euro-input
function EuroInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600, pointerEvents: 'none' }}>€</span>
      <input
        className="fi"
        type="number"
        min={0}
        step={1}
        placeholder={placeholder ?? '0'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: 28, width: '100%' }}
      />
    </div>
  );
}
