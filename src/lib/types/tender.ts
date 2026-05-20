// Lease Tender Automatisering — gedeelde types
// Komt overeen met DB-tabellen: tenders + tender_results

export type LeasePortaal = 'hiltermann' | 'alphabet' | 'ayvens' | 'arval' | 'mhc';

export const PORTALEN: { key: LeasePortaal; label: string }[] = [
  { key: 'hiltermann', label: 'Hiltermann' },
  { key: 'alphabet',   label: 'Alphabet' },
  { key: 'ayvens',     label: 'Ayvens' },
  { key: 'arval',      label: 'Arval' },
  { key: 'mhc',        label: 'MHC' },
];

export type TenderStatus = 'pending' | 'confirmed' | 'running' | 'done' | 'failed';
export type ResultStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface OptieItem {
  naam: string;
  prijs?: number;
  type?: 'optie' | 'accessoire' | 'pakket';
}

export interface LeasenormConfig {
  categorie?: string;                    // bijv. 'Categorie C'
  winterbanden?: 'all_season' | 'winter_zomer' | 'zomer';
  vervangend_vervoer?: '24u' | 'direct' | 'geen';
  eigen_risico?: 'laag' | 'middel' | 'hoog';
  brandstofvoorschot?: boolean;
}

export interface TenderInput {
  // Klant
  naam: string;
  email?: string;

  // Auto
  merk: string;
  model: string;
  uitvoering?: string;
  kleur?: string;
  bekleding?: string;

  // Lease
  looptijd: number;                      // maanden
  km_jaar: number;
  brandstof?: string;
  co2?: number;
  bijtelling?: number;

  // Opties / accessoires
  opties: OptieItem[];

  // Norm
  leasenorm: LeasenormConfig;
}

export interface TransparencyItem {
  veld: string;                          // bijv. 'kleur', 'opties.Sunset glas'
  status: 'ok' | 'warning' | 'error';
  jouw_waarde: string;
  portaal_waarde?: string;
  opties?: string[];                     // bij warning: lijst keuzes voor adviseur
}

// DB-record vorm
export interface Tender {
  id: string;
  created_at?: string;
  adviseur_id?: string;
  adviseur_naam?: string;

  klant_naam?: string;
  klant_email?: string;
  raw_email?: string;

  parsed_data?: TenderInput;
  leasenorm?: LeasenormConfig;

  status: TenderStatus;
}

export interface TenderResult {
  id: string;
  tender_id: string;
  created_at?: string;
  portaal: LeasePortaal;
  status: ResultStatus;
  started_at?: string;
  finished_at?: string;
  maandprijs?: number;
  transparency_check?: TransparencyItem[];
  pdf_url?: string;
  error_message?: string;
  raw_result?: Record<string, unknown>;
}
