export interface MatchKandidaat {
  id: string;
  naam: string;
  email?: string;
  reden: string;
  score: number;
}

export interface MatchSuggesties {
  berijder: { kandidaten: MatchKandidaat[] };
  bedrijf: { kandidaten: MatchKandidaat[] };
}

export interface MatchKeuze {
  berijderId?: string | null;
  bedrijfId?: string | null;
}
