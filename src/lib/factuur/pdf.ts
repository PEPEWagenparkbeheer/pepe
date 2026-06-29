// Client-side PDF-generator voor uitgaande facturen (PEPE-huisstijl, matcht de designs).
// Wordt aangeroepen vanuit de FactuurModal bij "Akkoord & verstuur": de browser genereert
// de PDF (logo via canvas) en uploadt de base64 naar de server, die opslaat + mailt.
//
// Hergebruikt het bewezen jsPDF-patroon uit ConsignatieModal (inkoopverklaring).

import jsPDF from 'jspdf';
import type { UitgaandeFactuur, FactuurTotalen, FactuurRegel } from '@/types/factuur';
import { berekenTotalen, regelExcl } from './btw';

const W = 210;
const M = 18;
const COL2 = W - M;

// PEPE-bedrijfsgegevens (footer)
const BEDRIJF = {
  tel: '0165 794 100',
  email: 'info@pepewagenparkbeheer.nl',
  web: 'pepewagenparkbeheer.nl',
  adres: 'De Gorzen 19, 4731 TV Oudenbosch',
  kvk: '88528502',
  btw: 'NL864670114B01',
  iban: 'NL02INGB0106922696',
  bic: 'INGBNL2A',
};

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDatum(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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
      svgText = svgText.replace(/<svg/, `<svg width="${targetW}" height="${Math.round(targetW / aspect)}"`);
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

function drawHeader(doc: jsPDF, witLogo: { data: string; aspect: number } | null): number {
  doc.setFillColor(15, 18, 24);
  doc.rect(0, 0, W, 30, 'F');
  if (witLogo) {
    const h = 12;
    doc.addImage(witLogo.data, 'PNG', M, 9, h * witLogo.aspect, h);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('PEPE®', M, 18);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('FACTUUR', COL2, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 188, 200);
  doc.text(BEDRIJF.adres, COL2, 22, { align: 'right' });
  doc.setFillColor(146, 25, 57);
  doc.rect(0, 30, W, 0.6, 'F');
  return 38;
}

function drawFooter(doc: jsPDF): void {
  const y = 280;
  doc.setDrawColor(146, 25, 57);
  doc.setLineWidth(0.4);
  doc.line(M, y, COL2, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110, 113, 118);
  const r1 = `T ${BEDRIJF.tel}   E ${BEDRIJF.email}   W ${BEDRIJF.web}`;
  const r2 = `KVK ${BEDRIJF.kvk}   BTW ${BEDRIJF.btw}   IBAN ${BEDRIJF.iban}   BIC ${BEDRIJF.bic}`;
  doc.text(r1, M, y + 5);
  doc.text(r2, M, y + 9);
}

function veldRij(doc: jsPDF, label: string, waarde: string, x: number, y: number, labelW: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 124, 130);
  doc.text(label, x, y);
  doc.setTextColor(25, 28, 33);
  doc.text(waarde || '—', x + labelW, y);
  return y + 5;
}

/** Tekent een kentekenplaat (geel met blauwe EU-strip). */
function drawKenteken(doc: jsPDF, kenteken: string, x: number, y: number): void {
  const w = 34, h = 9;
  doc.setFillColor(242, 202, 0);
  doc.roundedRect(x, y, w, h, 1.4, 1.4, 'F');
  doc.setFillColor(10, 45, 180);
  doc.roundedRect(x, y, 5, h, 1.4, 1.4, 'F');
  doc.rect(x + 3, y, 2, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(255, 255, 255);
  doc.text('NL', x + 2.5, y + h - 2.5, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(15, 18, 24);
  doc.text((kenteken || '').toUpperCase(), x + 6 + (w - 6) / 2, y + h - 2.4, { align: 'center' });
}

/** Bouwt de volledige factuur-PDF. */
export async function createFactuurPdf(factuur: UitgaandeFactuur): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const witLogo = await loadWitLogoAsPng();
  const totalen: FactuurTotalen = berekenTotalen(factuur.regels);
  const isAuto = factuur.type === 'auto';
  const isCredit = factuur.soort === 'creditnota';

  let y = drawHeader(doc, witLogo);

  // ── Factuur aan (links) + meta (rechts) ──
  const yStart = y + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(146, 25, 57);
  doc.text(isCredit ? 'Creditnota aan' : 'Factuur aan', M, yStart);
  let yl = yStart + 6;
  const lw = 26;
  yl = veldRij(doc, 'Naam', factuur.klant_naam ?? '', M, yl, lw);
  if (factuur.tav) yl = veldRij(doc, 'T.a.v.', factuur.tav, M, yl, lw);
  yl = veldRij(doc, 'Adres', factuur.adres ?? '', M, yl, lw);
  yl = veldRij(doc, 'Postcode', factuur.postcode ?? '', M, yl, lw);
  yl = veldRij(doc, 'Woonplaats', factuur.plaats ?? '', M, yl, lw);
  if (factuur.telefoon) yl = veldRij(doc, 'Telefoon', factuur.telefoon, M, yl, lw);
  if (factuur.email) yl = veldRij(doc, 'E-mail', factuur.email, M, yl, lw);
  if (factuur.kvk) yl = veldRij(doc, 'KVK-nummer', factuur.kvk, M, yl, lw);
  if (factuur.btw_nummer) yl = veldRij(doc, 'BTW-nummer', factuur.btw_nummer, M, yl, lw);

  // meta rechts
  const mx = 130;
  let ym = yStart;
  const mlw = 32;
  ym = veldRij(doc, 'Factuurnummer', factuur.factuurnummer ?? '—', mx, ym, mlw);
  ym = veldRij(doc, 'Debiteurnummer', factuur.twinfield_debiteur_code ?? '—', mx, ym, mlw);
  ym = veldRij(doc, 'Factuurdatum', fmtDatum(factuur.factuurdatum), mx, ym, mlw);
  ym = veldRij(doc, 'Vervaldatum', fmtDatum(factuur.vervaldatum), mx, ym, mlw);

  y = Math.max(yl, ym) + 4;

  // ── Voertuigblok (alleen auto) ──
  if (isAuto && factuur.voertuig) {
    const v = factuur.voertuig;
    doc.setFillColor(250, 247, 248);
    doc.rect(M, y, W - 2 * M, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(25, 28, 33);
    doc.text(`${v.merk ?? ''} ${v.model ?? ''}`.trim(), M + 4, y + 8);
    if (v.kenteken) drawKenteken(doc, v.kenteken, M + 4, y + 12);
    // rechtergrid met details
    const gx = 95;
    let gy = y + 6;
    const detail = (l: string, w: string) => {
      if (!w) return;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.setTextColor(120, 124, 130); doc.text(l, gx, gy);
      doc.setTextColor(25, 28, 33); doc.text(w, gx + 32, gy);
      gy += 4.5;
    };
    detail('Chassisnummer', v.chassis ?? '');
    detail('Datum deel 1A', v.datum_deel1a ?? '');
    detail('Km-stand', v.km_stand != null ? v.km_stand.toLocaleString('nl-NL') : '');
    detail('Kleur', v.kleur ?? '');
    y += 30;
  }

  // ── Specificatie-tabel ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(146, 25, 57);
  doc.text('Specificatie', M, y);
  y += 4;

  // kolommen: Aantal | Omschrijving | Prijs | Btw | Totaal excl
  const cAantal = M, cOms = M + 16, cPrijs = 132, cBtw = 158, cTot = COL2;
  doc.setFillColor(240, 241, 243);
  doc.rect(M, y, W - 2 * M, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 94, 100);
  doc.text('Aantal', cAantal + 1, y + 4);
  doc.text('Omschrijving', cOms, y + 4);
  doc.text('Prijs', cPrijs, y + 4, { align: 'right' });
  doc.text('Btw', cBtw, y + 4, { align: 'right' });
  doc.text('Totaal excl. btw', cTot, y + 4, { align: 'right' });
  y += 8;

  const btwLabel = (r: FactuurRegel) => (r.btw_code === 'hoog' ? '21%' : r.btw_code === 'marge' ? 'Marge' : 'V 0%');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const r of factuur.regels) {
    const sign = isCredit ? -1 : 1;
    doc.setTextColor(25, 28, 33);
    doc.text(String(r.aantal), cAantal + 1, y);
    const omsLines = doc.splitTextToSize(r.omschrijving, cPrijs - cOms - 4);
    doc.text(omsLines, cOms, y);
    doc.text(`€ ${fmtEuro(sign * r.prijs_excl)}`, cPrijs, y, { align: 'right' });
    doc.setTextColor(120, 124, 130);
    doc.text(btwLabel(r), cBtw, y, { align: 'right' });
    doc.setTextColor(25, 28, 33);
    doc.text(`€ ${fmtEuro(sign * regelExcl(r))}`, cTot, y, { align: 'right' });
    y += Math.max(5, omsLines.length * 4.5);
    doc.setDrawColor(232, 233, 236);
    doc.setLineWidth(0.2);
    doc.line(M, y - 1.5, COL2, y - 1.5);
  }

  y += 3;

  // ── Btw-specificatie (alleen tonen als er BTW is) ──
  const heeftBtw = totalen.btw_spec.some((s) => s.pct > 0);
  if (heeftBtw) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 25, 57);
    doc.text('Btw-specificatie', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 94, 100);
    doc.text('Btw-naam', M, y);
    doc.text('Btw %', 70, y, { align: 'right' });
    doc.text('Basisbedrag', 115, y, { align: 'right' });
    doc.text('Btw-bedrag', 150, y, { align: 'right' });
    y += 4;
    const sign = isCredit ? -1 : 1;
    for (const s of totalen.btw_spec) {
      doc.setTextColor(25, 28, 33);
      doc.text(s.naam, M, y);
      doc.text(s.pct ? `${s.pct},00` : '—', 70, y, { align: 'right' });
      doc.text(`€ ${fmtEuro(sign * s.basis)}`, 115, y, { align: 'right' });
      doc.text(`€ ${fmtEuro(sign * s.btw)}`, 150, y, { align: 'right' });
      y += 4.5;
    }
    y += 2;
  }

  // ── Totaaloverzicht (rechts) ──
  const sign = isCredit ? -1 : 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const totRij = (label: string, bedrag: number, vet = false) => {
    doc.setFont('helvetica', vet ? 'bold' : 'normal');
    doc.setTextColor(vet ? 146 : 90, vet ? 25 : 94, vet ? 57 : 100);
    doc.text(label, 132, y);
    doc.setTextColor(25, 28, 33);
    doc.text(`€ ${fmtEuro(sign * bedrag)}`, COL2, y, { align: 'right' });
    y += 5.5;
  };
  totRij('Totaal excl. btw', totalen.totaal_excl);
  if (heeftBtw) totRij('Btw', totalen.totaal_btw);
  doc.setDrawColor(146, 25, 57);
  doc.setLineWidth(0.3);
  doc.line(132, y - 2.5, COL2, y - 2.5);
  doc.setFontSize(11);
  totRij('Totaal', totalen.totaal_incl, true);

  // ── Betaaltekst ──
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 94, 100);
  const betaaltekst = isAuto
    ? `Gelieve het voertuig${factuur.voertuig?.kenteken ? ` (${factuur.voertuig.kenteken})` : ''} te verzekeren en te betalen vóór levering op rekeningnummer ${BEDRIJF.iban} onder vermelding van het factuurnummer.`
    : `Gelieve te betalen binnen ${factuur.betaaltermijn_dagen ?? 14} dagen na factuurdatum op rekeningnummer ${BEDRIJF.iban} onder vermelding van het factuurnummer.`;
  doc.text(doc.splitTextToSize(betaaltekst, W - 2 * M), M, y);

  drawFooter(doc);

  // ── Bijlage: beheerde voertuigen per entiteit (wagenparkbeheer) ──
  if (factuur.type === 'wagenparkbeheer' && factuur.bijlage?.entiteiten?.length) {
    tekenBijlage(doc, factuur, witLogo);
  }

  return doc;
}

function tekenBijlage(
  doc: jsPDF,
  factuur: UitgaandeFactuur,
  witLogo: { data: string; aspect: number } | null,
): void {
  const entiteiten = factuur.bijlage!.entiteiten;
  doc.addPage();
  let y = drawHeader(doc, witLogo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(146, 25, 57);
  doc.text('BIJLAGE — BEHEERDE VOERTUIGEN', M, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 124, 130);
  doc.text(
    `Behorend bij factuur ${factuur.factuurnummer ?? ''} — periode ${factuur.periode ?? ''}`,
    M, y + 9,
  );
  y += 16;

  const colW = (W - 2 * M) / 6;
  for (const ent of entiteiten) {
    if (y > 265) { drawFooter(doc); doc.addPage(); y = drawHeader(doc, witLogo) + 6; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(25, 28, 33);
    doc.text(`${ent.naam}   ${ent.aantal} voertuigen — € ${fmtEuro(ent.bedrag)}`, M, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 94, 100);
    let col = 0;
    let rowY = y;
    for (const k of ent.kentekens) {
      if (rowY > 268) { drawFooter(doc); doc.addPage(); rowY = drawHeader(doc, witLogo) + 6; col = 0; }
      doc.text(k, M + col * colW, rowY);
      col++;
      if (col >= 6) { col = 0; rowY += 4.5; }
    }
    y = (col === 0 ? rowY : rowY + 4.5) + 4;
  }
  drawFooter(doc);
}

/** Genereert de PDF en geeft pure base64 terug (voor upload/mail). */
export async function createFactuurPdfBase64(factuur: UitgaandeFactuur): Promise<string> {
  const doc = await createFactuurPdf(factuur);
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf('base64,') + 7);
}
