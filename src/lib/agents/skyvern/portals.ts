import type { TenderInput } from '@/lib/types/tender';
import type { AgentContext, AgentResult } from '../types';
import { runSkyvernPortal, type SkyvernPortalConfig } from './index';
import { hiltermannConfig } from '../portals/hiltermann';

/**
 * Skyvern portaal-configs voor de Fase-0 evaluatie.
 * Hergebruikt waar mogelijk de bestaande missie-teksten van de Stagehand-agents.
 */

/** Hiltermann — hergebruikt de bestaande missie (post-login flow). */
export const hiltermannSkyvern: SkyvernPortalConfig = {
  portaal: 'hiltermann',
  buildMission: hiltermannConfig.buildMission,
  verwachtePrijs: 609,
};

/** Arval — iframe/ASP.NET stresstest. Missie op basis van de gedocumenteerde flow. */
function buildArvalMission(tender: TenderInput): string {
  const optieRegels = tender.opties
    .map((o) => `   - ${o.naam}${o.prijs != null ? ` (~€${o.prijs})` : ''}`)
    .join('\n');

  // PEPE-korting overschrijft de portaal-korting alleen als die van ons hóger is.
  const kortingInstructie = tender.korting_pct != null
    ? `Vergelijk de huidige "% korting cataloguspijs" met ${tender.korting_pct}%: ALLEEN als ${tender.korting_pct}% HOGER is, overschrijf dan zowel "% korting cataloguspijs" als "% korting opties" met ${tender.korting_pct}. Is de portaal-korting gelijk of hoger, laat beide velden dan staan.`
    : `% kortingen NIET aanraken`;

  return `Voer in het Arval-portaal (myarval.com) een complete operational-lease calculatie uit voor onderstaande auto en lees aan het eind het maandbedrag af.

AUTO: ${tender.merk} ${tender.model} ${tender.uitvoering ?? ''} (${tender.brandstof ?? 'onbekend'})

STAPPEN:
1. ROL: Na inloggen verschijnt "Selecteer rol" — kies "Webdealer" van PEPE Holding B.V. (NIET Fleetmanager).
2. TEMPLATE: Ga naar bewaarde offertes en open de offerte van klant "Perke Pellis" (bestaande template met deze Skoda Fabia al geconfigureerd).
3. CLIENT-STAP: Alles is al ingevuld → klik direct "Opslaan & volgende".
4. Per auto-rij staan 3 icoontjes. Stel in:
   - ✏️ Potlood (calculatie): jaarkm = ${tender.km_jaar}, looptijd = ${tender.looptijd} maanden → klik Bijwerken.
   - ⚙️ Tandwiel (financieel): bedrag commissie = 2000 (PEPE-standaard); ${kortingInstructie} → klik Bijwerken.
   - "opties"-link (autoconfigurator): vink per sectie de juiste optie aan:
${optieRegels || '     (geen losse opties)'}
   - "accessoires (dealeropties)"-link: selecteer "ALPD - Afleverpakket" en vul de som van de niet-fabrieks accessoires ex btw in → Toevoegen → Sluiten.
5. Condities (rechter samenvattingspaneel): zet winterbanden/vervangend vervoer volgens norm.
6. Ga naar het tabblad "Resultaat" bovenin en lees het maandbedrag af.

Let op: de configurator, accessoires, potlood en tandwiel zitten in een iframe. Neem de tijd om modals te laten laden.`;
}

export const arvalSkyvern: SkyvernPortalConfig = {
  portaal: 'arval',
  buildMission: buildArvalMission,
  verwachtePrijs: 608,
};

/** AGENT_MAP-wrappers: zelfde signatuur als de oude Stagehand-agents. */
export function runHiltermannSkyvern(ctx: AgentContext): Promise<AgentResult> {
  return runSkyvernPortal(ctx, hiltermannSkyvern);
}
export function runArvalSkyvern(ctx: AgentContext): Promise<AgentResult> {
  return runSkyvernPortal(ctx, arvalSkyvern);
}
