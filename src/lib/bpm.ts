// Pluggable BPM-provider interface.
// Nu: handmatig — gebruiker voert rest-BPM in vanuit VWE-website of RDW.
// Later: AutotelexPRO-API of VWE-API inpluggen door BpmProvider-implementatie te vervangen.

export interface BpmResultaat {
  bruto_bpm: number;      // oorspronkelijk op 1e toelating
  rest_bpm: number;       // nog te betalen bij import
  methode: string;        // 'handmatig' | 'autotelex' | 'vwe'
}

export interface BpmProvider {
  /** Haal rest-BPM op voor een voertuig. Gooit een fout als het niet lukt. */
  haalBpm(input: BpmInput): Promise<BpmResultaat>;
}

export interface BpmInput {
  kenteken?: string;
  datum_deel1a?: string;  // ISO-datumstring
  km_stand?: number;
}

/** Handmatige provider: geeft de invoerwaarden direct terug (no-op, gebruiker heeft al ingevuld). */
class HandmatigeBpmProvider implements BpmProvider {
  async haalBpm(_input: BpmInput): Promise<BpmResultaat> {
    // Bij handmatige invoer vult de gebruiker bruto_bpm en rest_bpm zelf in via de modal.
    // Deze provider is een stub — de waarden worden rechtstreeks in de modal opgeslagen.
    throw new Error('Handmatige BPM: gebruiker voert waarde in via factuurmodal');
  }
}

// Actieve provider — later vervangen door: new AutotelexProvider() of new VweProvider()
export const bpmProvider: BpmProvider = new HandmatigeBpmProvider();

/**
 * Bereken de te betalen BPM voor een importauto (hulpfunctie voor UI-weergave).
 * Geeft de rest-BPM terug, afgerond op hele euro's.
 */
export function formatBpm(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Math.round(bedrag),
  );
}
