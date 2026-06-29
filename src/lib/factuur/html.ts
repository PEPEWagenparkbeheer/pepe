// Bouwt de factuur-HTML met de EXACTE CSS/fonts/logo uit het PEPE-design (claude/design export).
// Server-side door headless Chromium → PDF = mm-perfect identiek aan het design.

import type { UitgaandeFactuur, FactuurTotalen, FactuurRegel } from '@/types/factuur';
import { FACTUUR_CSS } from './factuurCss';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://flow.pepewagenparkbeheer.nl';
const ASSETS = `${BASE}/factuur-assets`;
// 'assets/...' uit het design → absolute URL (Chromium rendert zonder document-base).
const CSS = FACTUUR_CSS.replace(/assets\//g, `${ASSETS}/`);

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function euro(n: number): string {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}
function nlDat(d: Date): string {
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const btwNaam = (r: FactuurRegel) => (r.btw_code === 'hoog' ? '21%' : r.btw_code === 'marge' ? 'Marge' : 'V 0%');

function field(label: string, val: string): string {
  return `<div class="field"><span class="fl">${esc(label)}</span><span class="fv">${esc(val)}</span></div>`;
}

export function buildFactuurHtml(factuur: UitgaandeFactuur, totalen: FactuurTotalen): string {
  const isAuto = factuur.type === 'auto';
  const isCredit = factuur.soort === 'creditnota';
  const sign = isCredit ? -1 : 1;
  const titel = isCredit ? 'CREDITNOTA' : 'FACTUUR';
  const v = factuur.voertuig;

  const fdat = factuur.factuurdatum ? new Date(factuur.factuurdatum) : new Date();
  const vdat = factuur.vervaldatum ? new Date(factuur.vervaldatum)
    : new Date(fdat.getTime() + (factuur.betaaltermijn_dagen ?? 14) * 86400000);

  // Modelnaam splitsen: "merk + (eerste woord) model" donker, de uitvoering lichtgrijs ernaast.
  // bv. "Cupra" + "Leon 1,4 DSG e-Hybrid 204PK" → naam "Cupra Leon", uitvoering "1,4 DSG e-Hybrid 204PK".
  const modelWoorden = (v?.model ?? '').trim().split(/\s+/).filter(Boolean);
  const carNaam = `${v?.merk ?? ''} ${modelWoorden[0] ?? ''}`.trim() || '—';
  const carTrim = modelWoorden.slice(1).join(' ');
  const carband = isAuto && v ? `
    <section class="carband">
      <div class="car-head">
        <div class="car-name">${esc(carNaam)}</div>
        ${carTrim ? `<div class="car-trim">${esc(carTrim)}</div>` : ''}
      </div>
      <div class="chips">
        <div class="chip"><span class="cl">Kenteken</span><span class="cv">${esc(v.kenteken || '—')}</span></div>
        <div class="chip"><span class="cl">Chassisnummer</span><span class="cv">${esc(v.chassis || '—')}</span></div>
        <div class="chip"><span class="cl">Datum deel 1A</span><span class="cv">${esc(v.datum_deel1a || '—')}</span></div>
        <div class="chip"><span class="cl">Km-stand</span><span class="cv">${esc(v.km_stand != null ? v.km_stand.toLocaleString('nl-NL') : '—')}</span></div>
        <div class="chip"><span class="cl">Kleur</span><span class="cv">${esc(v.kleur || '—')}</span></div>
      </div>
    </section>` : '';

  const itemRows = factuur.regels.map((r) => {
    const tot = Math.round(r.aantal * r.prijs_excl * 100) / 100;
    return `<tr>
      <td class="qty">${esc(r.aantal)}</td>
      <td class="desc">${esc(r.omschrijving)}</td>
      <td class="num">${euro(sign * r.prijs_excl)}</td>
      <td class="btw">${esc(btwNaam(r))}</td>
      <td class="num">${euro(sign * tot)}</td>
    </tr>`;
  }).join('');

  const btwRows = totalen.btw_spec.map((s) => `<tr>
      <td>${esc(s.naam)}</td>
      <td>${s.naam === 'Marge' ? '—' : `${s.pct},00`}</td>
      <td>${euro(sign * s.basis)}</td>
      <td>${euro(sign * s.btw)}</td>
    </tr>`).join('');

  const paynote = isAuto
    ? `Gelieve het voertuig${v?.kenteken ? ` (<b>${esc(v.kenteken)}</b>)` : ''} te verzekeren en te betalen <b>vóór levering</b> op rekeningnummer <span class="iban">NL02INGB0106922696</span> onder vermelding van het factuurnummer.`
    : `Gelieve te betalen binnen <b>${factuur.betaaltermijn_dagen ?? 14} dagen</b> na factuurdatum op rekeningnummer <span class="iban">NL02INGB0106922696</span> onder vermelding van het factuurnummer.`;

  const bijlage = (factuur.type === 'wagenparkbeheer' && factuur.bijlage?.entiteiten?.length)
    ? `<div class="page">
        <header class="head" style="align-items:center;"><div><img class="logo" src="${ASSETS}/logo.png"></div>
        <div class="doc-meta"><div class="from"><div class="fn">PEPE Wagenparkbeheer</div></div></div></header>
        <div class="rule"></div>
        <div class="bijl-h">Bijlage — beheerde voertuigen</div>
        <div class="bijl-sub">Behorend bij factuur ${esc(factuur.factuurnummer ?? '')} · periode ${esc(factuur.periode ?? '')}</div>
        ${factuur.bijlage.entiteiten.map((e) => `<div class="ent">
          <div class="ent-h">${esc(e.naam)} — ${e.aantal} voertuigen — ${euro(e.bedrag)}</div>
          <div class="ent-grid">${e.kentekens.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
        </div>`).join('')}
      </div>` : '';

  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}
.bijl-h{font-family:'Archivo',sans-serif;font-weight:800;font-size:13px;letter-spacing:.04em;color:#23262b;margin-bottom:4px;}
.bijl-sub{font-size:9px;color:#6b6e73;margin-bottom:14px;}
.ent{margin-bottom:14px;}.ent-h{font-size:10px;font-weight:700;color:#23262b;border-left:2px solid #951730;padding-left:8px;margin-bottom:6px;}
.ent-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px 10px;font-size:8.5px;color:#6b6e73;}
@page{size:A4;margin:0;}@media print{html,body{background:#fff;}.page{margin:0;box-shadow:none;}}
</style></head><body>
  <div class="page">
    <header class="head" style="align-items:center;">
      <div><img class="logo" src="${ASSETS}/logo.png" alt="PEPE Wagenparkbeheer"></div>
      <div class="doc-meta"><div class="from">
        <div class="fn">PEPE Wagenparkbeheer</div>
        <div class="fa">De Gorzen 19, 4731 TV Oudenbosch<br>0165-794100 · info@pepewagenparkbeheer.nl</div>
      </div></div>
    </header>
    <div class="doc-title doc-title-center">${titel}</div>
    <div class="rule"></div>
    <section class="topgrid">
      <div>
        <div class="pcard-h">${isCredit ? 'Creditnota aan' : 'Factuur aan'}</div>
        <div class="frow">${field('Naam', factuur.klant_naam ?? '')}${field('T.a.v.', factuur.tav ?? '')}</div>
        <div class="frow">${field('Adres', factuur.adres ?? '')}<div class="pcwp">${field('Postcode', factuur.postcode ?? '')}${field('Woonplaats', factuur.plaats ?? '')}</div></div>
        <div class="frow">${field('Telefoon', factuur.telefoon ?? '')}${field('E-mail', factuur.email ?? '')}</div>
        <div class="frow">${field('KVK-nummer', factuur.kvk ?? '')}${field('BTW-nummer', factuur.btw_nummer ?? '')}</div>
      </div>
      <div class="metacard">
        <div class="mrow"><span class="mk">Factuurnummer</span><span class="mv">${esc(factuur.factuurnummer ?? 'CONCEPT')}</span></div>
        <div class="mrow"><span class="mk">Debiteurnummer</span><span class="mv">${esc(factuur.twinfield_debiteur_code ?? '—')}</span></div>
        <div class="mrow"><span class="mk">Factuurdatum</span><span class="mv">${nlDat(fdat)}</span></div>
        <div class="mrow hl"><span class="mk">Vervaldatum</span><span class="mv">${nlDat(vdat)}</span></div>
      </div>
    </section>
    ${carband}
    <div class="sec-h">Specificatie</div>
    <table class="items">
      <thead><tr>
        <th style="width:38px;">Aantal</th><th>Omschrijving</th>
        <th class="num" style="width:90px;">Prijs</th>
        <th class="num" style="width:52px;text-align:center;">Btw</th>
        <th class="num" style="width:100px;">Totaal excl. btw</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <section class="bottom">
      <div class="btwspec">
        <div class="spec-h">Btw-specificatie</div>
        <table class="btwtab">
          <thead><tr><th>Btw-naam</th><th>Btw&nbsp;%</th><th>Basisbedrag</th><th>Btw-bedrag</th></tr></thead>
          <tbody>${btwRows}</tbody>
        </table>
      </div>
      <div class="totals">
        <div class="tot-h">Totaaloverzicht</div>
        <div class="tot-body">
          <div class="tline"><span class="tk">Totaal excl. btw</span><span class="tv">${euro(sign * totalen.totaal_excl)}</span></div>
          <div class="tline"><span class="tk">Btw</span><span class="tv">${euro(sign * totalen.totaal_btw)}</span></div>
          <div class="tline grand"><span class="tk">Totaal</span><span class="tv">${euro(sign * totalen.totaal_incl)}</span></div>
        </div>
      </div>
    </section>
    <div class="vspace"></div>
    <div class="paynote">${paynote}</div>
    <footer class="foot">
      <div class="foot-row">
        <span><span class="lab">T</span>0165 794 100</span>
        <span><span class="lab">E</span>info@pepewagenparkbeheer.nl</span>
        <span><span class="lab">W</span>pepewagenparkbeheer.nl</span>
        <span><span class="lab">A</span>De Gorzen 19, 4731 TV Oudenbosch</span>
      </div>
      <div class="foot-row">
        <span><span class="lab">KVK</span>88528502</span>
        <span><span class="lab">BTW</span>NL864670114B01</span>
        <span><span class="lab">IBAN</span>NL02INGB0106922696</span>
        <span><span class="lab">BIC</span>INGBNL2A</span>
      </div>
    </footer>
  </div>
  ${bijlage}
</body></html>`;
}
