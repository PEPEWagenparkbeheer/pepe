// Gedeelde BTW- en totaalberekening voor uitgaande facturen.
// Gebruikt zowel client-side (live weergave in de modal) als server-side (Twinfield/PDF).
//
// Rondingsmethode: per BTW-groep (tarief) wordt het basisbedrag gesommeerd en daarna
// de BTW afgerond — dit komt overeen met de btw-specificatie in de designs én met hoe
// Twinfield de BTW per code totaliseert (voorkomt 1-cent-verschillen).

import type { BtwCode, FactuurRegel, FactuurTotalen, BtwSpecRegel } from '@/types/factuur';

/** BTW-percentage per code. Marge = 0% zichtbaar (margeregeling, geen BTW op de factuur). */
export const BTW_PCT: Record<BtwCode, number> = {
  hoog: 21,
  geen: 0,
  marge: 0,
};

/** Label voor de btw-specificatie op de PDF. */
export const BTW_NAAM: Record<BtwCode, string> = {
  hoog: '21%',
  geen: 'V 0%',
  marge: 'Marge',
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function regelExcl(r: FactuurRegel): number {
  return round2(r.aantal * r.prijs_excl);
}

export function berekenTotalen(regels: FactuurRegel[]): FactuurTotalen {
  // Groepeer basis per BTW-code
  const groepen = new Map<BtwCode, number>();
  for (const r of regels) {
    const basis = regelExcl(r);
    groepen.set(r.btw_code, round2((groepen.get(r.btw_code) ?? 0) + basis));
  }

  const btw_spec: BtwSpecRegel[] = [];
  let totaal_excl = 0;
  let totaal_btw = 0;

  for (const [code, basis] of groepen) {
    const pct = BTW_PCT[code];
    const btw = round2((basis * pct) / 100);
    totaal_excl = round2(totaal_excl + basis);
    totaal_btw = round2(totaal_btw + btw);
    btw_spec.push({ naam: BTW_NAAM[code], pct, basis, btw });
  }

  return {
    totaal_excl,
    totaal_btw,
    totaal_incl: round2(totaal_excl + totaal_btw),
    btw_spec,
  };
}
