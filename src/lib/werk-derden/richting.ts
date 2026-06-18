import type { WerkDerdenRecord } from '@/types';

/** Sentinel-waarde in `toegevoegd_door` voor meldingen die PEPE klaarzet voor een partner. */
export const PEPE_TOEGEVOEGD_DOOR = 'PEPE';

/**
 * Een "PEPE-opdracht" is een werk-derden-melding die PEPE klaarzet en die de
 * partner moet accepteren (richting PEPE → partner). Een partner-indiening
 * (partner → PEPE) heeft `toegevoegd_door` gelijk aan de partnernaam.
 *
 * Afgeleid zonder extra DB-kolom: PEPE-opdracht ⇔ `toegevoegd_door` is gezet
 * én verschilt van de partnernaam. Legacy-records (`toegevoegd_door` leeg)
 * tellen als partner-indiening.
 */
export function isPepeOpdracht(rec: Pick<WerkDerdenRecord, 'toegevoegd_door' | 'partner'>): boolean {
  const door = rec.toegevoegd_door?.trim();
  if (!door) return false;
  return door.toUpperCase() !== (rec.partner ?? '').trim().toUpperCase();
}
