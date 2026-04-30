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

export type ASStatus = 'nieuw' | 'in_behandeling' | 'besteld' | 'opgelost';
export type ASType = 'import' | 'nl';

export interface AfterSalesRecord {
  id: string;
  created_at?: string;
  updated_at?: string;
  kenteken: string;
  merk?: string;
  model?: string;
  klacht: string;
  status: ASStatus;
  type?: ASType;
  inkoper?: string;
  notitie?: string;
  rdw_apk_datum?: string;
  rdw_recalls?: number;
  rdw_recall_details?: string;
}

// ── Lease aanvragen ──────────────────────────────────────────

export type LeaseStatus = 'nieuw' | 'in_behandeling' | 'goedgekeurd' | 'afgewezen' | 'afgerond';

export interface LeaseAanvraag {
  id: string;
  created_at?: string;
  updated_at?: string;
  klant_naam: string;
  klant_email?: string;
  klant_telefoon?: string;
  voertuig?: string;
  lease_bedrag?: number;
  looptijd?: number;
  km_per_jaar?: number;
  status: LeaseStatus;
  notitie?: string;
  inkoper?: string;
}

// ── BTW / Credit ─────────────────────────────────────────────

export type BtwStatus = 'open' | 'ingediend' | 'ontvangen' | 'afgewezen';

export interface BtwRecord {
  id: string;
  created_at?: string;
  updated_at?: string;
  kenteken: string;
  merk?: string;
  model?: string;
  bedrag?: number;
  status: BtwStatus;
  notitie?: string;
  inkoper?: string;
}

// ── Auth ─────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  naam?: string;
}
