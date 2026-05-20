import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Arval agent — ASP.NET portaal (myarval.com).
 *
 * Correcte workflow (door PEPE-gebruiker bevestigd):
 *  1. Login (cookie-banner + email/wachtwoord + submit)
 *  2. SELECTEER ROL → klik "Webdealer" PEPE Holding B.V. (NIET Fleetmanager)
 *  3. Bewaarde offertes → klik op "Perke Pellis" rij (bestaande klant template)
 *  4. Client-stap: alles al ingevuld → klik direct "Opslaan & volgende"
 *  5. Auto's pagina → "Auto toevoegen" linksboven
 *  6. Uitgebreid zoeken → kies merk-tab → klik uitvoering-rij die matched
 *  7. Auto verschijnt bovenaan → klik blauwe "opties" link
 *  8. Opties configureren + accessoires (next iteration)
 *  9. Resultaat-stap: prijs + PDF (next iteration)
 *
 * KRITIEK voor ASP.NET portalen: gebruik altijd stagehand.act() voor klik-acties
 * op rij-elementen, NIET programmatic .click(). De DOM-click breekt ViewState
 * en redirect naar login.
 */

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

export async function runArval(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return { portaal: 'arval', status: 'failed', error_message: 'Geen LLM API key', duration_ms: Date.now() - start };
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

    // ── 1. Login ──
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Cookie-banner via DOM (geen ViewState gevoelig)
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button, a'))
        .find((e) => /alle cookies accepteren|accepteer|akkoord/i.test(e.textContent || ''));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(1500);

    // Email + wachtwoord direct invullen
    await page.locator('input[type="email"]').fill(credentials.user).catch(async () => {
      await page.locator('input[type="text"]').first().fill(credentials.user);
    });
    await page.locator('input[type="password"]').fill(credentials.pass);
    // Submit via DOM-click (login form heeft geen ViewState nog)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'))
        .find((e) => /submit|inloggen|login/i.test(((e as HTMLInputElement).value || e.textContent || '')));
      if (btn) (btn as HTMLElement).click();
    });

    // ── 2. Wacht op SELECTEER ROL ──
    const opSelect = await waitForText(page, ['Selecteer rol', 'Webdealer', 'Fleetmanager'], 15000);
    if (!opSelect) throw new Error(`Niet op rol-selectie (${page.url()})`);

    // ── 3. Klik op WEBDEALER PEPE Holding B.V. (NIET Fleetmanager) ──
    await stagehand.act('Klik op de "Webdealer" rij van PEPE Holding B.V. in de SELECTEER ROL lijst (NIET de Fleetmanager rij)');
    await page.waitForTimeout(5000);

    // ── 4. Mogelijke SelectClient tussenstap ──
    if (/SelectClient/i.test(page.url())) {
      await stagehand.act('Klik op de rij van "PEPE Holding B.V." in de klanten-lijst');
      await page.waitForTimeout(5000);
    }

    // ── 5. Bewaarde offertes pagina → klik Perke Pellis rij ──
    const opOffertes = await waitForText(page, ['Bewaarde offertes', 'Perke Pellis'], 15000);
    if (!opOffertes) throw new Error(`Niet op Bewaarde offertes pagina (${page.url()})`);

    await stagehand.act('Klik op de rij van "Perke Pellis" in de bewaarde offertes tabel');
    await page.waitForTimeout(5000);

    // ── 6. Client-formulier — alles is al ingevuld, klik Opslaan & volgende ──
    const opClient = await waitForText(page, ['voornaam', 'Opslaan & volgende', 'Privacy Statement'], 15000);
    if (!opClient) throw new Error(`Client-formulier niet zichtbaar (${page.url()})`);

    // Verzeker dat Privacy checkbox aangevinkt is (alleen voor de zekerheid)
    await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
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

    await stagehand.act('Klik op de blauwe "Opslaan & volgende" knop onderaan');
    await page.waitForTimeout(5000);

    // ── 7. Auto's pagina → klik "Auto toevoegen" ──
    const opAutos = await waitForText(page, ["Auto's", 'Auto toevoegen'], 12000);
    if (!opAutos) throw new Error(`Niet op Auto's pagina (${page.url()})`);

    await stagehand.act('Klik op "Auto toevoegen" linksboven in de Auto\'s sectie');
    await page.waitForTimeout(3000);

    // ── 8. Uitgebreid zoeken → kies merk + uitvoering ──
    // Eerst de juiste merk-blok openen (Skoda etc.)
    await stagehand.act(`Klik op het merk-blok van ${tender.merk} om de modellen uit te klappen`);
    await page.waitForTimeout(2000);

    // Klik op de juiste uitvoering-rij in de tabel
    const uitvoeringHint = [tender.model, tender.uitvoering].filter(Boolean).join(' ');
    await stagehand.act(
      `Klik op de uitvoering-rij die het beste matched met: "${uitvoeringHint}". ` +
      `De rijen tonen merk + model + motor + transmissie + uitvoering (bv. "Skoda Fabia 1.0 TSI Greentech 85kW DSG Selection 5d").`,
    );
    await page.waitForTimeout(5000);

    // ── 9. Auto verschijnt bovenaan → klik "opties" ──
    const opAutoToegevoegd = await waitForText(page, [tender.model, 'opties'], 10000);
    if (!opAutoToegevoegd) throw new Error('Auto niet toegevoegd / opties-link niet zichtbaar');

    await stagehand.act(`Klik op de blauwe "opties" link onder de zojuist toegevoegde ${tender.merk} ${tender.model} rij`);
    await page.waitForTimeout(3000);

    // ── 10. Opties / accessoires configureren — TODO volgende iteratie ──
    // Voor MVP: lees prijs af die al zichtbaar is (basisprijs zonder opties)
    let maandprijs: number | null = null;
    try {
      const ext = await stagehand.extract(
        'Haal het maandbedrag op zoals zichtbaar in de auto-rij (catprijs incl btw/bpm of de leaseprijs per maand).',
        z.object({ maandprijs: z.number() }),
      );
      maandprijs = ext.maandprijs || null;
    } catch { /* skip */ }

    return {
      portaal: 'arval',
      status: maandprijs && maandprijs > 0 ? 'completed' : 'failed',
      maandprijs: maandprijs ?? 0,
      error_message: maandprijs ? undefined : 'Tot opties-stap gekomen — configuratie nog niet geïmplementeerd',
      raw: { auto_toegevoegd: true, url: page.url() },
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
