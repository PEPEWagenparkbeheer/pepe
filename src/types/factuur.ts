// Gedeelde types voor de uitgaande facturen-module (Auto + Diensten).

export type FactuurType =
  | 'auto'
  | 'wagenparkbeheer'
  | 'shortlease'
  | 'werk_derden'
  | 'diensten_overig';

export type FactuurSoort = 'factuur' | 'creditnota';

export type FactuurStatus =
  | 'pijplijn'       // import-auto: geparkeerd tijdens after-sales-traject, buiten de werklijst
  | 'concept'
  | 'aanvullen'      // auto: wacht op kenteken/BPM/chassis
  | 'ter_controle'   // recurring: klaargezet, wacht op akkoord
  | 'definitief'     // geboekt in Twinfield, nummer toegekend
  | 'verzonden'
  | 'geannuleerd';

/** BTW-behandeling van een factuurregel. */
export type BtwCode = 'hoog' | 'geen' | 'marge';
//  hoog  = 21% (Twinfield VH)
//  geen  = 0%  (Twinfield VN) — o.a. BPM
//  marge = margeregeling: geen BTW op de factuur, marge-vatcode in Twinfield

export interface FactuurRegel {
  omschrijving: string;
  aantal: number;
  prijs_excl: number;     // stukprijs excl. BTW
  btw_code: BtwCode;
  grootboek?: string;     // dim1; per type ingevuld door de engine indien leeg
}

/** Eén entiteit in de wagenparkbeheer-bijlage. */
export interface BijlageEntiteit {
  naam: string;
  aantal: number;
  bedrag: number;
  kentekens: string[];
}

export interface FactuurVoertuig {
  kenteken?: string;
  chassis?: string;
  merk?: string;
  model?: string;
  kleur?: string;
  km_stand?: number;
  datum_deel1a?: string;     // DD-MM-YYYY
  bruto_bpm?: number;
  rest_bpm?: number;
  bpm_methode?: string;      // 'handmatig' | 'koerslijst' | 'forfaitair' | 'taxatie'
  btw_soort?: 'btw' | 'marge';
  toe_te_betalen?: number | null;  // BTW-auto: vast incl.-bedrag; bij BPM-wijziging herrekent de voertuigprijs
}

export interface UitgaandeFactuur {
  id: string;
  created_at?: string;
  updated_at?: string;

  type: FactuurType;
  soort: FactuurSoort;
  status: FactuurStatus;

  // Auto onder handelscondities (handels-/CarCollect-auto's): toont disclaimer "geen garantie" op de PDF.
  handelsconditie?: boolean;

  hubspot_company_id?: string | null;
  klant_naam?: string | null;
  tav?: string | null;
  adres?: string | null;
  postcode?: string | null;
  plaats?: string | null;
  telefoon?: string | null;
  email?: string | null;
  factuur_email?: string | null;
  kvk?: string | null;
  btw_nummer?: string | null;
  land?: string | null;
  twinfield_debiteur_code?: string | null;

  factuurnummer?: string | null;
  twinfield_invoice_id?: string | null;
  factuurdatum?: string | null;
  vervaldatum?: string | null;
  betaaltermijn_dagen?: number | null;
  credit_van_factuur_id?: string | null;

  regels: FactuurRegel[];
  totaal_excl?: number;
  totaal_btw?: number;
  totaal_incl?: number;

  voertuig?: FactuurVoertuig | null;
  bijlage?: { entiteiten: BijlageEntiteit[] } | null;

  bron?: 'handmatig' | 'docusign' | 'recurring' | 'carcollect' | 'btw_credit' | 'werk_derden';
  bron_ref?: string | null;
  /** Deeplink uit de CarCollect-mail om de factuur in CarCollect te uploaden. Tijdelijk — vervalt zodra de API-upload werkt. */
  carcollect_upload_url?: string | null;
  docusign_envelope_id?: string | null;
  /** Koppeling naar de after_sales-rij (import-flow). Data stroomt van after-sales naar deze factuur. */
  after_sales_id?: string | null;
  periode?: string | null;
  recurring_key?: string | null;

  pdf_storage_path?: string | null;
  verzonden_op?: string | null;
  verzonden_naar?: string | null;
  bezorging_mislukt?: boolean | null;
  bezorg_reden?: string | null;
  akkoord_door?: string | null;
  notitie?: string | null;
}

/** BTW-specificatieregel voor de PDF (gegroepeerd per tarief). */
export interface BtwSpecRegel {
  naam: string;
  pct: number;
  basis: number;
  btw: number;
}

export interface FactuurTotalen {
  totaal_excl: number;
  totaal_btw: number;
  totaal_incl: number;
  btw_spec: BtwSpecRegel[];
}
