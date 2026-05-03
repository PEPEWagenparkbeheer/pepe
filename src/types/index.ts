// ── Zoekopdrachten (Zoeken) ──────────────────────────────────

export interface Zoekopdracht {
  id: number;
  klant: string;
  auto: string; // "Merk Model" — gecombineerde string
  details?: string;
  km?: string;
  jaar?: string;
  budget?: string;
  btw?: string; // '' | 'BTW' | 'Marge'
  wiezoekt?: string;
  email_klant?: string;
  opmerkingen?: string;
  as_email?: string;
  terugkoppeling_txt?: string;
  kleuren?: string[];
  opties?: Record<string, boolean>;
  brandstof?: string[];
  // voortgang-vlaggen
  uitgewerkt?: boolean;
  terugkoppeling?: boolean;
  dealer?: boolean;
  inkopen?: boolean;
  contract?: boolean;
  akkoord?: boolean;
  akkoord_door?: string;
  akkoord_datum?: string;
  prio?: boolean;
  uitgesteld?: boolean;
}

// ── After Sales ──────────────────────────────────────────────

export type ASAutoType = 'import' | 'nl' | 'nieuw' | 'voorraad';

export interface AfterSalesAuto {
  id: string;
  created_at?: string;

  // Basisinfo
  kenteken: string;
  merk?: string;
  model?: string;
  klant?: string;
  type?: ASAutoType;
  platen?: string;        // kentekenplaten info
  notitie?: string;

  // In behandeling / algemeen
  wie_levert_af?: string;
  afleverdatum?: string;
  binnen?: boolean;
  aflevercontrole?: boolean;
  status?: string;

  // Import checklist
  aangevraagd?: boolean;
  transportdatum?: string;
  betaald?: boolean;
  rdw_ingeschreven?: boolean;
  bpm_ingediend?: boolean;
  bpm_goedgekeurd?: boolean;
  bin_ontvangen?: boolean;
  kentekenbewijzen?: boolean;
  gelangenbest?: boolean;

  // Extra basisinfo
  email_klant?: string;
  tijdstip_levering?: string;
  klaarmaker_naam?: string;
  btw_credit?: boolean;

  // Rijklaar maken
  wie_rijklaar?: string;
  proefrit?: boolean;
  apk?: string;
  terugroep?: string;
  accessoires?: string;       // komma-gescheiden tags: "Alarm,Trekhaak,Matten"
  extra_accessoires?: string; // vrij tekstveld
  klaar?: boolean;

  // Geplande aflevering
  factuur?: boolean;
  poetsen?: boolean;
  hubspot?: boolean;
  taken_notitie?: string;

  // Archief
  afgeleverd_op?: string;
  wie_heeft_afgeleverd?: string;
  gearchiveerd?: boolean;
}

export interface ASKlacht {
  id: string;
  auto_id: string;
  created_at?: string;
  kenteken: string;
  merk_model?: string;
  klant?: string;
  omschrijving: string;
  oplossing?: string;
  status: 'open' | 'opgelost';
  opgelost_op?: string;
  door_wie?: string;
}

// ── Lease ────────────────────────────────────────────────────

export interface LeaseKlant {
  id: string;
  created_at?: string;
  naam: string;
  looptijd?: string;          // '12'|'24'|'36'|'48'|'60'
  jaarkilometrage?: string;   // '10000'|'15000'|...
  banden?: string;            // 'Zomer'|'Winter'|'All season'
  eigen_risico?: string;      // 'Laag'|'Hoog'
  vervangend_vervoer?: boolean;
  brandstofvoorschot?: boolean;
  notities?: string;
}

export interface LeaseAanvraag {
  id: string;
  created_at?: string;

  // Klant
  klant_id?: string;
  klant_naam: string;
  berijder?: string;

  // Auto
  merk?: string;
  model?: string;

  // Lease details
  leasemaatschappij?: string;
  leasenormbedrag?: number;   // verwacht normbedrag €/mnd
  leasetarief?: number;       // scherpste tarief (ingevuld door inkoper)

  // Verdiensten
  verdiensten_lm?: number;
  verdiensten_lm_pct?: number;
  verdiensten_dealer?: number;
  verdiensten_dealer_pct?: number;

  // Norm (overgenomen van klant of handmatig)
  looptijd?: string;
  jaarkilometrage?: string;
  banden?: string;
  eigen_risico?: string;
  vervangend_vervoer?: boolean;
  brandstofvoorschot?: boolean;

  // Status
  inkoper?: string;
  offerte_verstuurd?: boolean;
  verwachte_leverdatum?: string;
  notities?: string;

  // Akkoord / Verkoop
  akkoord?: boolean;
  akkoord_door?: string;
  akkoord_datum?: string;
  verkocht?: boolean;
  verkocht_op?: string;
  in_btw_lijst?: boolean;
}

// ── BTW / Credit ─────────────────────────────────────────────

export type BtwAutoType = 'btw' | 'credit';

export interface BtwRecord {
  id: string;
  created_at?: string;

  // Basis
  kenteken?: string;
  auto: string;           // merk / model
  berijder?: string;
  type?: BtwAutoType;
  klant?: string;
  dealer_verkoper?: string;
  ingekocht_op?: string; // ISO date

  // Bedrag
  bedrag?: number;

  // Voortgang
  gelangenbest_verstuurd?: boolean;
  geld_van_lm?: boolean;
  geld_van_dealer?: boolean;

  // Meta
  opmerkingen?: string;
  inkoper?: string;
  gearchiveerd?: boolean;
}

// ── Auth ─────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  naam?: string;
}
