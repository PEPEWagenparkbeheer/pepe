// Client-side PDF-generator voor uitgaande facturen — getrouw aan het PEPE-factuurdesign
// (Facturen pakket/Autofactuur.html). Wit papier, bordeaux accenten, donkere tabelheader.
// Engine = jsPDF (zelfde als de inkoopverklaring; geen extra render-engine). Logo via pepePdf.

import jsPDF from 'jspdf';
import type { UitgaandeFactuur, FactuurTotalen, FactuurRegel } from '@/types/factuur';
import { berekenTotalen, regelExcl } from './btw';
import { loadRgbLogoAsPng } from './pepePdf';

// Design-kleuren (uit de template :root)
const BURG: [number, number, number] = [149, 23, 48];
const INK: [number, number, number] = [35, 38, 43];
const MUTED: [number, number, number] = [107, 110, 115];
const SOFT: [number, number, number] = [139, 142, 147];
const LINE: [number, number, number] = [228, 228, 231];
const HAIR: [number, number, number] = [207, 207, 211];
const TINT: [number, number, number] = [250, 247, 248];
const WIT: [number, number, number] = [255, 255, 255];

const W = 210;
const M = 14;          // zijmarge (14mm, conform padding)
const R = W - M;       // 196
const CW = R - M;      // 182 content-breedte

const BEDRIJF = {
  naam: 'PEPE Wagenparkbeheer',
  adres1: 'De Gorzen 19, 4731 TV Oudenbosch',
  adres2: '0165-794100 · info@pepewagenparkbeheer.nl',
  tel: '0165 794 100', email: 'info@pepewagenparkbeheer.nl', web: 'pepewagenparkbeheer.nl',
  kvk: '88528502', btw: 'NL864670114B01', iban: 'NL02INGB0106922696', bic: 'INGBNL2A',
};

function euro(n: number): string {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}
function fmtDatum(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const col = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
const fill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const draw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

// ── Lettertypes uit het design: Manrope (body) + Archivo (display). Statisch gesubset in /public/fonts. ──
const fontCache: Record<string, string> = {};
async function ttfBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}
async function registerFonts(doc: jsPDF): Promise<void> {
  const defs: [string, string, string][] = [
    ['Manrope-Regular.ttf', 'Manrope', 'normal'],
    ['Manrope-Bold.ttf', 'Manrope', 'bold'],
    ['Archivo-Bold.ttf', 'Archivo', 'bold'],
    ['Archivo-ExtraBold.ttf', 'Archivo', 'extrabold'],
  ];
  for (const [file, fam, style] of defs) {
    if (!fontCache[file]) fontCache[file] = await ttfBase64(`/fonts/${file}`);
    doc.addFileToVFS(file, fontCache[file]);
    doc.addFont(file, fam, style);
  }
}

/** Label (klein, uppercase) boven een waarde met onderlijn — zoals .field in het design. */
function veld(doc: jsPDF, label: string, waarde: string, x: number, y: number, breedte: number): void {
  doc.setFont('Manrope', 'normal');
  doc.setFontSize(6);
  col(doc, SOFT);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('Manrope', 'bold');
  doc.setFontSize(8.5);
  col(doc, INK);
  const tekst = waarde || '';
  doc.text(doc.splitTextToSize(tekst, breedte)[0] ?? '', x, y + 4.6);
  draw(doc, HAIR);
  doc.setLineWidth(0.2);
  doc.line(x, y + 6, x + breedte, y + 6);
}

function kenteken(doc: jsPDF, k: string, x: number, y: number): void {
  const w = 30, h = 8;
  fill(doc, [242, 202, 0]);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'F');
  fill(doc, [10, 45, 180]);
  doc.roundedRect(x, y, 4.5, h, 1.2, 1.2, 'F');
  doc.rect(x + 2.5, y, 2, h, 'F');
  doc.setFont('Manrope', 'bold'); doc.setFontSize(4.5); col(doc, WIT);
  doc.text('NL', x + 2.2, y + h - 2.6, { align: 'center' });
  doc.setFontSize(11); col(doc, INK);
  doc.text((k || '').toUpperCase(), x + 5 + (w - 5) / 2, y + h - 2.4, { align: 'center' });
}

export async function createFactuurPdf(factuur: UitgaandeFactuur): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  try { await registerFonts(doc); } catch { /* fallback: helvetica */ }
  const logo = await loadRgbLogoAsPng();
  const totalen: FactuurTotalen = berekenTotalen(factuur.regels);
  const isAuto = factuur.type === 'auto';
  const isCredit = factuur.soort === 'creditnota';
  const sign = isCredit ? -1 : 1;
  const titel = isCredit ? 'CREDITNOTA' : 'FACTUUR';

  // ── HEADER (wit) ──
  let y = 14;
  if (logo) {
    const h = 12; doc.addImage(logo.data, 'PNG', M, y, h * logo.aspect, h);
  } else {
    doc.setFont('Manrope', 'bold'); doc.setFontSize(18); col(doc, INK); doc.text('PEPE®', M, y + 9);
  }
  doc.setFont('Manrope', 'bold'); doc.setFontSize(8.5); col(doc, BURG);
  doc.text(BEDRIJF.naam, R, y + 4, { align: 'right' });
  doc.setFont('Manrope', 'normal'); doc.setFontSize(6.8); col(doc, MUTED);
  doc.text(BEDRIJF.adres1, R, y + 8, { align: 'right' });
  doc.text(BEDRIJF.adres2, R, y + 11.2, { align: 'right' });

  y += 20;
  doc.setFont('Archivo', 'extrabold'); doc.setFontSize(15); col(doc, INK);
  doc.text(titel, W / 2, y, { align: 'center', charSpace: 2.6 });
  y += 3;
  fill(doc, BURG); doc.rect(M, y, CW, 0.8, 'F');
  y += 7;

  // ── TOPGRID: Factuur aan (links) + metacard (rechts) ──
  const metaX = 124, metaW = R - metaX;          // ~72mm
  const linkerW = metaX - 6 - M;                 // ruimte links
  const subW = (linkerW - 8) / 2;                // 2 sub-kolommen
  const topY = y;

  doc.setFont('Manrope', 'bold'); doc.setFontSize(7); col(doc, BURG);
  doc.text(isCredit ? 'CREDITNOTA AAN' : 'FACTUUR AAN', M, topY, { charSpace: 0.6 });

  let fy = topY + 7;
  const rij = (l1: string, v1: string, l2?: string, v2?: string) => {
    veld(doc, l1, v1, M, fy, subW);
    if (l2 !== undefined) veld(doc, l2, v2 ?? '', M + subW + 8, fy, subW);
    fy += 11;
  };
  rij('Naam', factuur.klant_naam ?? '', 'T.a.v.', factuur.tav ?? '');
  rij('Adres', factuur.adres ?? '', 'Postcode', factuur.postcode ?? '');
  rij('Woonplaats', factuur.plaats ?? '', 'Telefoon', factuur.telefoon ?? '');
  rij('E-mail', factuur.email ?? '', 'KVK-nummer', factuur.kvk ?? '');
  if (factuur.btw_nummer) rij('BTW-nummer', factuur.btw_nummer, '', '');

  // Metacard (tinted box)
  // In een concept-preview (nog niet geboekt) tonen we alvast factuurdatum/vervaldatum + "CONCEPT".
  const nlDat = (d: Date) => d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fdat = factuur.factuurdatum ? new Date(factuur.factuurdatum) : new Date();
  const vdat = factuur.vervaldatum
    ? new Date(factuur.vervaldatum)
    : new Date(fdat.getTime() + (factuur.betaaltermijn_dagen ?? 14) * 86400000);
  const metaRows: [string, string, boolean][] = [
    ['Factuurnummer', factuur.factuurnummer ?? 'CONCEPT', false],
    ['Debiteurnummer', factuur.twinfield_debiteur_code ?? '—', false],
    ['Factuurdatum', nlDat(fdat), false],
    ['Vervaldatum', nlDat(vdat), true],
  ];
  const metaH = metaRows.length * 7 + 4;
  fill(doc, TINT); doc.rect(metaX, topY, metaW, metaH, 'F');
  draw(doc, LINE); doc.setLineWidth(0.2); doc.rect(metaX, topY, metaW, metaH, 'S');
  let my = topY + 6;
  metaRows.forEach(([k, v, hl], i) => {
    doc.setFont('Manrope', 'normal'); doc.setFontSize(8); col(doc, hl ? BURG : MUTED);
    doc.text(k, metaX + 4, my);
    doc.setFont('Manrope', 'bold'); col(doc, hl ? BURG : INK);
    doc.text(v, R - 4, my, { align: 'right' });
    if (i < metaRows.length - 1) { draw(doc, LINE); doc.setLineWidth(0.1); doc.line(metaX + 4, my + 2.5, R - 4, my + 2.5); }
    my += 7;
  });

  y = Math.max(fy, topY + metaH) + 4;

  // ── CARBAND (alleen auto) ──
  if (isAuto && factuur.voertuig) {
    const v = factuur.voertuig;
    const bandH = 30;
    fill(doc, TINT); doc.rect(M, y, CW, bandH, 'F');
    draw(doc, LINE); doc.setLineWidth(0.2); doc.rect(M, y, CW, bandH, 'S');
    doc.setFont('Archivo', 'extrabold'); doc.setFontSize(18); col(doc, INK);
    doc.text(`${v.merk ?? ''} ${v.model ?? ''}`.trim(), M + 5, y + 9);
    // chips-rij (5 kolommen) onder de naam
    const chips: [string, string][] = [
      ['Kenteken', v.kenteken ?? '—'],
      ['Chassisnummer', v.chassis ?? '—'],
      ['Datum deel 1A', v.datum_deel1a ?? '—'],
      ['Km-stand', v.km_stand != null ? v.km_stand.toLocaleString('nl-NL') : '—'],
      ['Kleur', v.kleur ?? '—'],
    ];
    const chipW = (CW - 10) / 5;
    const cy = y + 16;
    chips.forEach(([cl, cv], i) => {
      const cx = M + 5 + i * chipW;
      fill(doc, BURG); doc.rect(cx, cy, 0.7, 9, 'F');
      doc.setFont('Manrope', 'normal'); doc.setFontSize(5.5); col(doc, SOFT);
      doc.text(cl.toUpperCase(), cx + 2.5, cy + 2.5);
      doc.setFont('Manrope', 'bold'); doc.setFontSize(8); col(doc, INK);
      doc.text(doc.splitTextToSize(cv, chipW - 4)[0] ?? '', cx + 2.5, cy + 7);
    });
    y += bandH + 6;
  }

  // ── SECTIEKOP "Specificatie" (gecentreerd met lijnen) ──
  doc.setFont('Archivo', 'bold'); doc.setFontSize(8); col(doc, INK);
  const secT = 'SPECIFICATIE';
  const tw = doc.getTextWidth(secT);
  draw(doc, LINE); doc.setLineWidth(0.2);
  doc.line(M, y, W / 2 - tw / 2 - 4, y);
  doc.line(W / 2 + tw / 2 + 4, y, R, y);
  doc.text(secT, W / 2, y + 1, { align: 'center', charSpace: 0.8 });
  y += 6;

  // ── ITEMS-TABEL ──
  const cAantal = M + 2, cOms = M + 16, cPrijs = 150, cBtw = 166, cTot = R - 1;
  fill(doc, INK); doc.rect(M, y, CW, 7, 'F');
  doc.setFont('Manrope', 'bold'); doc.setFontSize(6); col(doc, WIT);
  doc.text('AANTAL', cAantal, y + 4.6);
  doc.text('OMSCHRIJVING', cOms, y + 4.6);
  doc.text('PRIJS', cPrijs, y + 4.6, { align: 'right' });
  doc.text('BTW', cBtw, y + 4.6, { align: 'center' });
  doc.text('TOTAAL EXCL. BTW', cTot, y + 4.6, { align: 'right' });
  y += 7;

  const btwLabel = (r: FactuurRegel) => (r.btw_code === 'hoog' ? '21%' : r.btw_code === 'marge' ? 'Marge' : 'V 0%');
  doc.setFontSize(8.5);
  factuur.regels.forEach((r) => {
    const omsLines = doc.splitTextToSize(r.omschrijving, cPrijs - cOms - 6);
    const rowH = Math.max(8, omsLines.length * 4 + 4);
    doc.setFont('Manrope', 'bold'); col(doc, MUTED);
    doc.text(String(r.aantal), cAantal, y + 5);
    doc.setFont('Manrope', 'normal'); col(doc, INK);
    doc.text(omsLines, cOms, y + 5);
    doc.setFont('Manrope', 'bold');
    doc.text(euro(sign * r.prijs_excl), cPrijs, y + 5, { align: 'right' });
    doc.setFont('Manrope', 'normal'); col(doc, MUTED);
    doc.text(btwLabel(r), cBtw, y + 5, { align: 'center' });
    doc.setFont('Manrope', 'bold'); col(doc, INK);
    doc.text(euro(sign * regelExcl(r)), cTot, y + 5, { align: 'right' });
    draw(doc, LINE); doc.setLineWidth(0.2); doc.line(M, y + rowH, R, y + rowH);
    y += rowH;
  });
  // dikkere afsluitlijn
  draw(doc, INK); doc.setLineWidth(0.5); doc.line(M, y, R, y);
  y += 8;

  // ── BOTTOM: btw-spec (links) + totalen (rechts) ──
  const totW = 78, totX = R - totW, leftW = totX - 6 - M;
  const bottomY = y;

  // btw-specificatie
  draw(doc, LINE); doc.setLineWidth(0.2); doc.rect(M, bottomY, leftW, 8 + totalen.btw_spec.length * 6 + 2, 'S');
  fill(doc, TINT); doc.rect(M, bottomY, leftW, 7, 'F');
  doc.setFont('Manrope', 'bold'); doc.setFontSize(6.5); col(doc, BURG);
  doc.text('BTW-SPECIFICATIE', M + 3, bottomY + 4.6, { charSpace: 0.4 });
  let by = bottomY + 11;
  doc.setFontSize(6); col(doc, SOFT); doc.setFont('Manrope', 'bold');
  doc.text('BTW-NAAM', M + 3, by);
  doc.text('BTW %', M + leftW * 0.42, by, { align: 'right' });
  doc.text('BASISBEDRAG', M + leftW * 0.7, by, { align: 'right' });
  doc.text('BTW-BEDRAG', M + leftW - 3, by, { align: 'right' });
  by += 5;
  totalen.btw_spec.forEach((s) => {
    doc.setFont('Manrope', 'normal'); doc.setFontSize(8); col(doc, MUTED);
    doc.text(s.naam, M + 3, by);
    col(doc, INK);
    doc.text(s.pct ? `${s.pct},00` : '—', M + leftW * 0.42, by, { align: 'right' });
    doc.text(euro(sign * s.basis), M + leftW * 0.7, by, { align: 'right' });
    doc.text(euro(sign * s.btw), M + leftW - 3, by, { align: 'right' });
    by += 6;
  });

  // totalen-box
  fill(doc, INK); doc.rect(totX, bottomY, totW, 7, 'F');
  doc.setFont('Manrope', 'bold'); doc.setFontSize(6.5); col(doc, WIT);
  doc.text('TOTAALOVERZICHT', totX + 3, bottomY + 4.6, { charSpace: 0.4 });
  draw(doc, LINE); doc.setLineWidth(0.2);
  let ty = bottomY + 12;
  const tline = (k: string, val: number) => {
    doc.setFont('Manrope', 'normal'); doc.setFontSize(8.5); col(doc, MUTED);
    doc.text(k, totX + 3, ty);
    doc.setFont('Manrope', 'bold'); col(doc, INK);
    doc.text(euro(sign * val), R - 3, ty, { align: 'right' });
    ty += 6;
  };
  tline('Totaal excl. btw', totalen.totaal_excl);
  if (totalen.totaal_btw !== 0) tline('Btw', totalen.totaal_btw);
  draw(doc, INK); doc.setLineWidth(0.5); doc.line(totX + 3, ty - 1, R - 3, ty - 1);
  ty += 3;
  doc.setFont('Archivo', 'bold'); doc.setFontSize(11); col(doc, INK);
  doc.text('TOTAAL', totX + 3, ty, { charSpace: 0.4 });
  doc.setFont('Archivo', 'extrabold'); doc.setFontSize(15); col(doc, BURG);
  doc.text(euro(sign * totalen.totaal_incl), R - 3, ty, { align: 'right' });
  doc.rect(totX, bottomY, totW, (ty - bottomY) + 4, 'S');

  const naBottom = Math.max(by, ty) + 8;

  // ── PAYNOTE (bordeaux linkerrand, tinted) — tegen de footer geplakt (zoals het design) ──
  const betaaltekst = isAuto
    ? `Gelieve het voertuig${factuur.voertuig?.kenteken ? ` (${factuur.voertuig.kenteken})` : ''} te verzekeren en te betalen vóór levering op ${BEDRIJF.iban} o.v.v. het factuurnummer.`
    : `Gelieve te betalen binnen ${factuur.betaaltermijn_dagen ?? 14} dagen na factuurdatum op ${BEDRIJF.iban} o.v.v. het factuurnummer.`;
  const ptLines = doc.splitTextToSize(betaaltekst, CW - 12);
  const ptH = ptLines.length * 4.6 + 7;
  const FOOT_Y = 280;
  const ptY = Math.max(naBottom, FOOT_Y - 6 - ptH); // direct boven de footer
  fill(doc, TINT); doc.rect(M, ptY, CW, ptH, 'F');
  fill(doc, BURG); doc.rect(M, ptY, 1.4, ptH, 'F');
  doc.setFont('Manrope', 'normal'); doc.setFontSize(8.5); col(doc, INK);
  doc.text(ptLines, W / 2, ptY + 5.5, { align: 'center' });

  // ── FOOTER ──
  drawFooter(doc);

  // ── BIJLAGE (wagenparkbeheer) ──
  if (factuur.type === 'wagenparkbeheer' && factuur.bijlage?.entiteiten?.length) {
    tekenBijlage(doc, factuur, logo);
  }
  return doc;
}

function drawFooter(doc: jsPDF): void {
  const y = 280;
  draw(doc, BURG); doc.setLineWidth(0.5); doc.line(M, y, R, y);
  doc.setFont('Manrope', 'normal'); doc.setFontSize(6.8); col(doc, MUTED);
  doc.text(`T ${BEDRIJF.tel}    E ${BEDRIJF.email}    W ${BEDRIJF.web}`, M, y + 5);
  doc.text(`KVK ${BEDRIJF.kvk}    BTW ${BEDRIJF.btw}    IBAN ${BEDRIJF.iban}    BIC ${BEDRIJF.bic}`, M, y + 9);
}

function tekenBijlage(doc: jsPDF, factuur: UitgaandeFactuur, logo: { data: string; aspect: number } | null): void {
  doc.addPage();
  let y = 14;
  if (logo) { const h = 11; doc.addImage(logo.data, 'PNG', M, y, h * logo.aspect, h); }
  doc.setFont('Manrope', 'bold'); doc.setFontSize(12); col(doc, BURG);
  doc.text('BIJLAGE — BEHEERDE VOERTUIGEN', R, y + 6, { align: 'right' });
  y += 16;
  doc.setFont('Manrope', 'normal'); doc.setFontSize(8); col(doc, MUTED);
  doc.text(`Behorend bij factuur ${factuur.factuurnummer ?? ''} · periode ${factuur.periode ?? ''}`, M, y);
  y += 8;
  const colW = CW / 6;
  for (const ent of factuur.bijlage!.entiteiten) {
    if (y > 265) { drawFooter(doc); doc.addPage(); y = 18; }
    doc.setFont('Manrope', 'bold'); doc.setFontSize(8.5); col(doc, INK);
    doc.text(`${ent.naam}   ${ent.aantal} voertuigen — ${euro(ent.bedrag)}`, M, y);
    y += 5;
    doc.setFont('Manrope', 'normal'); doc.setFontSize(7.5); col(doc, MUTED);
    let cI = 0;
    for (const k of ent.kentekens) {
      if (y > 270) { drawFooter(doc); doc.addPage(); y = 18; cI = 0; }
      doc.text(k, M + cI * colW, y);
      cI++; if (cI >= 6) { cI = 0; y += 4.5; }
    }
    y = (cI === 0 ? y : y + 4.5) + 5;
  }
  drawFooter(doc);
}

export async function createFactuurPdfBase64(factuur: UitgaandeFactuur): Promise<string> {
  const doc = await createFactuurPdf(factuur);
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf('base64,') + 7);
}
