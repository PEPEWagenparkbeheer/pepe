import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Arval agent — ASP.NET portaal (myarval.com)
 *
 * Workflow:
 *  1. Login (cookie-banner + email/wachtwoord + submit)
 *  2. SELECTEER ROL → PEPE Holding B.V.
 *  3. Dashboard → "Nieuwe offerte"
 *  4. Client-stap: vul PEPE-gegevens in (aanvrager altijd PEPE)
 *  5. Auto-stap: configureer met tender-data (LLM nodig)
 *  6. Resultaat: lees maandprijs + download PDF
 */

// PEPE als aanvrager — Arval vraagt altijd op PEPE-naam
const PEPE_CLIENT = {
  voornaam: 'Joep',
  achternaam: 'van den Bergh',
  client_naam: 'PEPE Wagenparkbeheer',
  geslacht: 'man',
  adres: 'De Gorzen',
  huisnummer: '19',
  postcode: '4731 TV',
  plaats: 'Oudenbosch',
  telefoon: '0651268702',
  email: 'info@pepewagenparkbeheer.nl',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageText(page: any): Promise<string> {
  try { return await page.evaluate(() => (document.body as HTMLElement).innerText); }
  catch { return ''; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForText(page: any, patterns: string[], timeoutMs = 15000): Promise<boolean> {
  const eind = Date.now() + timeoutMs;
  while (Date.now() < eind) {
    const txt = await pageText(page);
    if (patterns.some((p) => txt.toLowerCase().includes(p.toLowerCase()))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/**
 * Vul een ASP.NET formulier-veld in door op basis van label-tekst de
 * bijbehorende input te vinden. ASP.NET genereert IDs zoals ctl00$... die
 * niet betrouwbaar zijn, maar de label-tekst is wel stabiel.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fillByLabel(page: any, labelText: string, value: string): Promise<boolean> {
  return await page.evaluate(
    ({ label, val }: { label: string; val: string }) => {
      const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      // Strategie 1: label-element met for-attribute
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        if (re.test(lbl.textContent || '')) {
          const forId = lbl.getAttribute('for');
          if (forId) {
            const el = document.getElementById(forId) as HTMLInputElement | HTMLSelectElement | null;
            if (el) {
              if (el.tagName === 'SELECT') {
                const opts = Array.from((el as HTMLSelectElement).options);
                const match = opts.find((o) => o.text.toLowerCase().includes(val.toLowerCase()) || o.value.toLowerCase().includes(val.toLowerCase()));
                if (match) { (el as HTMLSelectElement).value = match.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
              } else {
                (el as HTMLInputElement).value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            }
          }
        }
      }
      // Strategie 2: input direct na label-tekst-cel (table-layout)
      const tds = Array.from(document.querySelectorAll('td, div'));
      for (const td of tds) {
        if (re.test(td.textContent || '') && (td.textContent || '').length < 50) {
          const nextEl = td.nextElementSibling;
          const input = nextEl?.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null;
          if (input) {
            if (input.tagName === 'SELECT') {
              const opts = Array.from((input as HTMLSelectElement).options);
              const match = opts.find((o) => o.text.toLowerCase().includes(val.toLowerCase()));
              if (match) { (input as HTMLSelectElement).value = match.value; input.dispatchEvent(new Event('change', { bubbles: true })); }
            } else {
              (input as HTMLInputElement).value = val;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          }
        }
      }
      return false;
    },
    { label: labelText, val: value },
  );
}

export async function runArval(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return { portaal: 'arval', status: 'failed', error_message: 'Geen LLM API key (Anthropic of Groq)', duration_ms: Date.now() - start };
  }

  const useLocal = process.env.STAGEHAND_ENV === 'LOCAL';
  const model = process.env.STAGEHAND_MODEL ?? 'groq/openai/gpt-oss-120b';

  const stagehand = useLocal
    ? new Stagehand({ env: 'LOCAL', model, verbose: 1, localBrowserLaunchOptions: { headless: false } })
    : new Stagehand({
        env: 'BROWSERBASE',
        apiKey: process.env.BROWSERBASE_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
        model,
        verbose: 1,
      });

  try {
    await stagehand.init();
    const page = await stagehand.context.newPage();

    // ── 1. Login pagina ──
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Cookie-banner — probeer direct DOM click, anders via act
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a'));
      const el = els.find((e) => /alle cookies accepteren|accepteer|akkoord/i.test(e.textContent || ''));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(1500);

    // ── 2. Login via directe locator ──
    await page.locator('input[type="email"]').fill(credentials.user).catch(async () => {
      await page.locator('input[type="text"]').first().fill(credentials.user);
    });
    await page.locator('input[type="password"]').fill(credentials.pass);
    // Submit — eerst directe DOM click, fallback Enter
    const submitDone = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'))
        .find((e) => /submit|inloggen|login/i.test(((e as HTMLInputElement).value || e.textContent || '')));
      if (btn) { (btn as HTMLElement).click(); return true; }
      return false;
    });
    if (!submitDone) {
      // Fallback: focus password field en stuur Enter via keyboard
      await page.evaluate(() => {
        const pw = document.querySelector('input[type="password"]') as HTMLInputElement | null;
        if (pw) {
          pw.focus();
          const form = pw.closest('form');
          if (form) form.submit();
        }
      });
    }

    // ── 3. Wacht op rol-selectie ──
    const opSelect = await waitForText(page, ['Selecteer rol', 'Fleetmanager'], 15000);
    if (!opSelect) throw new Error(`Niet op rol-selectie geland (${page.url()})`);

    // ── 4. Kies PEPE Holding B.V. via Stagehand.act ──
    // BELANGRIJK: programmatic DOM-click breekt ASP.NET ViewState → redirect
    // naar login. Stagehand.act simuleert echte mouse-event → werkt wel.
    await stagehand.act('Klik op de rij van "PEPE Holding B.V." in de SELECTEER ROL lijst');
    await page.waitForTimeout(5000);

    // ── 4b. Mogelijke tussenstap: SelectClient.aspx (extra klant-keuze) ──
    if (/SelectClient/i.test(page.url())) {
      await stagehand.act('Klik op de rij van "PEPE Holding B.V." in de klanten-lijst');
      await page.waitForTimeout(5000);
    }

    // ── 5. Klik "Nieuwe offerte" ──
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'));
      const el = els.find((e) => /nieuwe offerte/i.test(e.textContent || (e as HTMLInputElement).value || ''));
      if (el) (el as HTMLElement).click();
    });
    const opClient = await waitForText(page, ['voornaam', 'Privacy Statement'], 10000);
    if (!opClient) throw new Error(`Client-formulier niet zichtbaar (${page.url()})`);

    // ── 6. Client-formulier invullen (PEPE-gegevens) ──
    await fillByLabel(page, 'voornaam', PEPE_CLIENT.voornaam);
    await fillByLabel(page, 'achternaam', PEPE_CLIENT.achternaam);
    await fillByLabel(page, 'client naam', PEPE_CLIENT.client_naam);
    await fillByLabel(page, 'geslacht', PEPE_CLIENT.geslacht);
    await fillByLabel(page, 'adres', PEPE_CLIENT.adres);
    await fillByLabel(page, 'Huisnummer', PEPE_CLIENT.huisnummer);
    await fillByLabel(page, 'postcode', PEPE_CLIENT.postcode);
    await fillByLabel(page, 'plaats', PEPE_CLIENT.plaats);
    await fillByLabel(page, 'telefoonnummer', PEPE_CLIENT.telefoon);
    await fillByLabel(page, 'e-mailadres', PEPE_CLIENT.email);

    // Info intern: echte klant-naam uit tender voor PEPE eigen referentie
    const internInfo = `Tender voor: ${tender.naam}${tender.merk ? ` — ${tender.merk} ${tender.model}` : ''}`;
    await fillByLabel(page, 'Info intern', internInfo);

    // Privacy Statement checkbox
    await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      // De akkoord-checkbox staat meestal bij de Privacy Statement tekst
      for (const cb of checkboxes) {
        const parent = cb.closest('tr, div, p, td');
        if (parent && /privacy statement|akkoord/i.test(parent.textContent || '')) {
          if (!(cb as HTMLInputElement).checked) {
            (cb as HTMLInputElement).checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    });

    // ── 7. Opslaan & volgende ──
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'));
      const el = els.find((e) => /opslaan.{0,5}volgende/i.test(e.textContent || (e as HTMLInputElement).value || ''));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(5000);

    // ── 8. Auto-stap (TODO: configurator) ──
    // Voor nu: extract wat we kunnen vinden + return wat we hebben.
    // De Auto-stap vereist LLM-acties die we later implementeren.

    const text = await pageText(page);
    const opAuto = /auto/i.test(text) && !/voornaam/i.test(text);

    if (!opAuto) {
      // Validatie-fouten? Geef ze terug
      const errorText = text.split('\n').filter((l) => /verplicht|fout|error|moet/i.test(l)).join('; ');
      throw new Error(`Client-form niet geaccepteerd: ${errorText || 'onbekende reden'}`);
    }

    // Probeer alvast prijs te extracten als die zichtbaar zou zijn
    let maandprijs: number | null = null;
    try {
      const ext = await stagehand.extract(
        'Haal de maandelijkse leaseprijs op (€/maand) als die zichtbaar is. Anders 0.',
        z.object({ maandprijs: z.number() }),
      );
      maandprijs = ext.maandprijs || null;
    } catch { /* skip */ }

    return {
      portaal: 'arval',
      status: maandprijs && maandprijs > 0 ? 'completed' : 'failed',
      maandprijs: maandprijs ?? 0,
      error_message: maandprijs && maandprijs > 0 ? undefined : 'Auto-stap nog niet geïmplementeerd — client-form gelukt, prijs niet gegenereerd',
      raw: { client_form_gelukt: true, url: page.url() },
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    return {
      portaal: 'arval',
      status: 'failed',
      error_message: (e as Error).message,
      duration_ms: Date.now() - start,
    };
  } finally {
    await stagehand.close().catch(() => {});
  }
}
