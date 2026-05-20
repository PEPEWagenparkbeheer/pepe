import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import type { AgentContext, AgentResult } from './types';

/**
 * Hiltermann agent — robuuste flow met tekst-checks en direct locator-fills.
 *
 * Belangrijke lessen:
 * - SPA: URL verandert niet altijd na navigatie, gebruik tekst-checks
 * - Stagehand.act voor login-velden vult soms leeg → gebruik direct locator.fill()
 * - Stagehand.extract kan hallucineren → lees prijs uit DOM via evaluate
 */

const PROVISIE_HILTERMANN = 2000;

const CATEGORIEEN = [
  'Optiepakketten', 'Lakken', 'Bekleding', 'Velgen/Banden',
  'Interieur', 'Exterieur', 'Overige accessoires', 'Overige opties',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageText(page: any): Promise<string> {
  try {
    return await page.evaluate(() => (document.body as HTMLElement).innerText);
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageHtml(page: any): Promise<string> {
  try {
    return await page.evaluate(() => (document.body as HTMLElement).innerHTML);
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForText(page: any, patterns: string[], timeoutMs = 15000): Promise<boolean> {
  const eind = Date.now() + timeoutMs;
  while (Date.now() < eind) {
    // Check zowel innerText (visible text) als innerHTML (alt-tags, image-titels, etc.)
    const [txt, html] = await Promise.all([pageText(page), pageHtml(page)]);
    const combined = (txt + ' ' + html).toLowerCase();
    if (patterns.some((p) => combined.includes(p.toLowerCase()))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readFolPrice(page: any): Promise<number | null> {
  try {
    const text: string = await pageText(page);
    const m = text.match(/Full operational lease[\s\S]{0,200}€\s*([\d.,]+)/i);
    if (!m) return null;
    const cijfers = m[1].replace(/\./g, '').split(',')[0];
    const n = parseInt(cijfers, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export async function runHiltermann(ctx: AgentContext): Promise<AgentResult> {
  const start = Date.now();
  const { tender, credentials } = ctx;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { portaal: 'hiltermann', status: 'failed', error_message: 'ANTHROPIC_API_KEY ontbreekt', duration_ms: Date.now() - start };
  }

  // STAGEHAND_ENV bepaalt of we lokaal of via Browserbase draaien.
  // - 'LOCAL': lokale Chromium via Playwright (eigen IP, geen extra kosten, voor dev/zelf-host)
  // - 'BROWSERBASE': cloud browser via Browserbase (vereist Vercel-deploy maar bot-detection issues)
  const useLocal = process.env.STAGEHAND_ENV === 'LOCAL';

  if (!useLocal && (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID)) {
    return { portaal: 'hiltermann', status: 'failed', error_message: 'Browserbase env ontbreekt', duration_ms: Date.now() - start };
  }

  // Standaard Groq (gratis tier voor dev). Voor productie: switch naar
  // anthropic/claude-sonnet-4-6 via STAGEHAND_MODEL env-var.
  // Groq's gpt-oss-120b ondersteunt json_schema (vereist voor Stagehand structured outputs).
  // Llama-3.3 niet — bewuste keuze. Voor productie: 'anthropic/claude-sonnet-4-6' via STAGEHAND_MODEL.
  const model = process.env.STAGEHAND_MODEL ?? 'groq/openai/gpt-oss-120b';

  const stagehand = useLocal
    ? new Stagehand({
        env: 'LOCAL',
        verbose: 1,
        model,
        localBrowserLaunchOptions: { headless: false },
      })
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

    // ── 1. Login (via direct locator fill — act vult soms leeg) ──
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const userInput = page.locator('input[placeholder="Gebruikersnaam"]');
    const passInput = page.locator('input[placeholder="Wachtwoord"]');
    await userInput.fill(credentials.user);
    await passInput.fill(credentials.pass);
    await stagehand.act('Klik op de "Inloggen" knop');

    const ingelogd = await waitForText(page, ['Kies een verkoper', 'Welkom'], 20000);
    if (!ingelogd) throw new Error(`Login mislukt — pagina toont nog steeds Inloggen-formulier`);

    // ── 2. Verkoper bevestigen ──
    await page.waitForTimeout(2000);
    await stagehand.act('Klik op de knop "Ga verder"');

    // ── 3. Wacht tot merken écht geladen zijn (niet alleen UI-frame) ──
    // Hiltermann SPA toont eerst "Ophalen merken.." voordat de merken-grid renderet.
    // Wacht tot het tender-merk daadwerkelijk in de DOM staat.
    const merkenGeladen = await waitForText(page, [tender.merk], 25000);
    if (!merkenGeladen) throw new Error(`Merken-grid niet geladen, ${tender.merk} niet zichtbaar in DOM`);
    await page.waitForTimeout(2000);

    // ── 4. Merk klikken ──
    await stagehand.act(`Klik op de afbeelding-tegel van het merk ${tender.merk}`);
    await page.waitForTimeout(3000);
    // Wacht tot modellen écht geladen (vergelijkbaar patroon — eerst "Ophalen modellen..")
    const modellenGeladen = await waitForText(page, [tender.model, 'uitvoeringen'], 20000);
    if (!modellenGeladen) throw new Error(`Merk-klik werkte niet, model ${tender.model} niet zichtbaar`);

    // ── 5. Model klikken ──
    await stagehand.act(`Klik op de afbeelding-tegel van model ${tender.model}`);
    await page.waitForTimeout(3000);

    // ── 6. Uitvoering kiezen via prijs-knop ──
    const uitvoeringHint = [tender.uitvoering, tender.brandstof].filter(Boolean).join(' ');
    await stagehand.act(
      `Op deze pagina staat een tabel met uitvoeringen. Kies de rij die het beste matched met: "${uitvoeringHint}". ` +
      `Klik op de prijs-knop helemaal rechts in die rij (donker rond, met €-bedrag erop).`,
    );

    // Wacht tot we op de calculation pagina zijn (zoek "Full operational lease" tekst)
    const opCalc = await waitForText(page, ['Full operational lease', 'Fiscale waarde'], 15000);
    if (!opCalc) throw new Error(`Calculation-pagina niet bereikt na uitvoering-klik`);
    await page.waitForTimeout(2000);

    const basisPrijs = await readFolPrice(page);

    // ── 7. Opties-categorieën uitklappen ──
    for (const cat of CATEGORIEEN) {
      await stagehand.act(`Klik op het + naast de categorie-titel "${cat}" om uit te klappen`).catch(() => {});
    }

    // ── 8. Opties matchen + aanvinken ──
    const ongevondenOpties: typeof tender.opties = [];
    for (const optie of tender.opties) {
      const prijsHint = optie.prijs
        ? ` (prijs ongeveer €${optie.prijs}${tender.prijzen_incl_btw === false ? ' ex btw' : ' incl btw'})`
        : '';
      try {
        await stagehand.act(
          `Vink het rondje/bolletje aan bij de optie die het beste matched met: "${optie.naam}"${prijsHint}. ` +
          `Negeer als je hem niet kunt vinden.`,
        );
      } catch {
        ongevondenOpties.push(optie);
      }
    }

    // ── 9. Eigen opties voor niet-gevonden ──
    for (const optie of ongevondenOpties) {
      try {
        await stagehand.act(
          `Scroll naar het "Eigen opties toevoegen" formulier onderaan. ` +
          `Vul Beschrijving in: "${optie.naam}". Vul Prijs incl. BTW in: ${optie.prijs ?? 0}. Klik "Toevoegen".`,
        );
      } catch {}
    }

    // ── 10. Prijsinstellingen modal ──
    await stagehand.act('Klik op de knop "Prijsinstellingen" linksboven (met tandwiel-icoon)');
    await waitForText(page, ['Looptijd', 'Kilometrage per jaar'], 8000);
    await page.waitForTimeout(1500);

    await stagehand.act(`Open de "Looptijd" dropdown en kies ${tender.looptijd}`);
    await page.waitForTimeout(800);
    await stagehand.act(`Open de "Kilometrage per jaar" dropdown en kies ${tender.km_jaar}`);
    await page.waitForTimeout(800);

    if (tender.leasenorm.vervangend_vervoer === 'geen') {
      await stagehand.act('Zet de checkbox "Vervangend vervoer" UIT').catch(() => {});
    }
    if (tender.leasenorm.winterbanden === 'all_season') {
      await stagehand.act('Zet de checkbox "Winterbanden" UIT').catch(() => {});
    }

    // ── 11. Overige instellingen → provisie ──
    await stagehand.act('Klik op het tabblad "Overige instellingen" bovenin de modal');
    await page.waitForTimeout(1500);
    await stagehand.act('Klik op het oog-icoon naast Provisie om het bedrag-veld zichtbaar te maken').catch(() => {});
    await page.waitForTimeout(500);
    await stagehand.act(`Wis het Provisie veld volledig en typ ${PROVISIE_HILTERMANN}`);
    await page.waitForTimeout(800);

    // ── 12. Hercalculeren ──
    await stagehand.act('Klik op de zwarte "Hercalculeren" knop rechtsonder');
    await page.waitForTimeout(5000);
    await stagehand.act('Sluit de prijsinstellingen-modal via de X als hij nog open is').catch(() => {});
    await page.waitForTimeout(2000);

    // ── 13. Nieuwe prijs aflezen ──
    let prijs = await readFolPrice(page);
    if (prijs === null || prijs === 0) {
      const ext = await stagehand.extract(
        'Haal het maandbedrag op zoals het GROOT in de linker zijbalk staat onder "Full operational lease". ' +
        'Niet de fiscale waarde of een tarief per km.',
        z.object({ maandprijs: z.number() }),
      );
      prijs = ext.maandprijs;
    }

    return {
      portaal: 'hiltermann',
      status: 'completed',
      maandprijs: prijs ?? 0,
      raw: {
        basis_prijs: basisPrijs,
        eind_prijs_dom: prijs,
        ongevonden_opties: ongevondenOpties.map((o) => o.naam),
        provisie_gebruikt: PROVISIE_HILTERMANN,
      },
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    return {
      portaal: 'hiltermann',
      status: 'failed',
      error_message: (e as Error).message,
      duration_ms: Date.now() - start,
    };
  } finally {
    await stagehand.close().catch(() => {});
  }
}
