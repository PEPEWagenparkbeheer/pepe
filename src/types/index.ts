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
  transport_order_id?: string;
  transport_status?: string;
  transport_status_updated_at?: string;
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
  wie_rijklaar_klaar?: boolean;  // WIE persoon heeft bevestigd klaar te zijn
  proefrit?: boolean;
  proefrit_op?: string;          // datum proefrit afgevinkt
  binnen_op?: string;            // datum binnen afgevinkt
  apk?: string;                  // APK vervaldatum (ISO date) uit RDW
  terugroep?: string;            // 'geen' = geen recall, anders: tekst van openstaande actie
  accessoires?: string;          // komma-gescheiden items: "Alarm,Trekhaak,Matten"
  accessoires_klaar?: string;    // komma-gescheiden afgevinkte items
  extra_accessoires?: string;
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

  // Tijdstempel + wie per afgevinkt veld
  veld_meta?: Record<string, { op: string; door: string }>;

  // Partner (extern rijklaar-bedrijf)
  partners_toegewezen?: string[];
  partners_klaar?: string[];
  taak_toewijzingen?: { taak: string; partner: string }[];
  partner_binnen?: boolean;
  partner_binnen_op?: string;
  partner_datum?: string;
  partner_onderdelen_besteld?: boolean;
  partner_updates?: { tekst: string; op: string; door: string }[];
  partner_updates_gezien_op?: string;
}

export interface KlachtUpdate {
  tekst: string;
  op: string;    // ISO timestamp
  door: string;
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
  status: 'open' | 'in_behandeling' | 'opgelost';
  opgelost_op?: string;
  door_wie?: string;
  updates?: KlachtUpdate[];
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

  // Expliciete status (vervangt boolean-combinaties)
  status?: 'nieuw' | 'offerte' | 'akkoord_klant' | 'verkocht';
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

  // Credit factuur velden
  lm_pct?: number;
  lm_bedrag?: number;
  dealer_pct?: number;
  dealer_bedrag?: number;
  verwachte_leverdatum?: string;

  // Voortgang
  gelangenbest_verstuurd?: boolean;
  geld_van_lm?: boolean;
  geld_van_dealer?: boolean;

  // Meta
  opmerkingen?: string;
  inkoper?: string;
  gearchiveerd?: boolean;
  veld_meta?: Record<string, { op: string; door: string }>;
}

// ── Inname formulier ─────────────────────────────────────────

export interface InnameFormulier {
  id: string;
  created_at?: string;
  kenteken: string;
  meldcode?: string;
  after_sales_id?: string;
  datum?: string;
  inname_door?: string;
  merk_type?: string;
  brandstof?: string;
  km_stand?: number;
  laatste_beurt_datum?: string;
  laatste_beurt_km?: number;
  apk_geldig_tot?: string;
  tankinhoud?: string;
  band_lv?: string;
  band_rv?: string;
  band_la?: string;
  band_ra?: string;
  band_seizoen?: string;
  bandenmaat?: string;
  items?: Record<string, boolean>;
  schade_diagram?: { x: number; y: number; type: string; symbol: string }[];
  schade_omschrijving?: string;
}

// ── Leads ────────────────────────────────────────────────────

export type LeadStatus = 'nieuw' | 'opgepakt' | 'gebeld' | 'interesse' | 'verkocht' | 'geen_interesse';
export type LeadBron = 'autoscout24' | 'autowereld' | 'marktplaats' | 'email' | 'anders';

export interface Lead {
  id: string;
  created_at?: string;
  bron: LeadBron;
  klant_naam: string;
  email?: string;
  telefoon?: string;
  auto: string;
  prijs?: string;
  advertentie_url?: string;
  bericht?: string;
  status: LeadStatus;
  wie?: string;
  notities?: string;
  vervolgactie?: string;
  vervolgdatum?: string;
  gearchiveerd: boolean;
  contactmomenten?: KlachtUpdate[];
  veld_meta?: Record<string, { op: string; door: string }>;
}

// ── Auth ─────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  naam?: string;
}
