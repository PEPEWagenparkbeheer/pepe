// Server-side HTML→PDF rendering met headless Chromium (@sparticuz/chromium + puppeteer-core).
// Rendert de exacte design-HTML naar een mm-perfecte PDF. Alleen server (nodejs runtime).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { buildFactuurHtml } from './html';
import { berekenTotalen } from './btw';
import type { UitgaandeFactuur } from '@/types/factuur';

export async function renderFactuurPdf(factuur: UitgaandeFactuur): Promise<Buffer> {
  const totalen = berekenTotalen(factuur.regels);
  const html = buildFactuurHtml(factuur, totalen);

  // Op Vercel zit @sparticuz/chromium/bin niet in de functie-bundle; daarom laden we de Chromium-pack
  // via een URL (gedownload + uitgepakt naar /tmp, daarna warm gecachet). Versie = de geïnstalleerde.
  const PACK = process.env.CHROMIUM_PACK_URL
    || 'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';
  const executablePath = process.env.CHROME_PATH || (await chromium.executablePath(PACK));
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    try { await page.evaluate('document.fonts ? document.fonts.ready : true'); } catch { /* fonts best-effort */ }
    try { await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }); } catch { /* assets best-effort */ }
    const pdf = await page.pdf({ format: 'a4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
