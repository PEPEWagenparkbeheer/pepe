/**
 * Toont de medewerkersnaam voor stamps ("goedgekeurd door …").
 * Onze medewerkers loggen in als NAAM@pepewagenparkbeheer.nl — toon dan "Naam".
 * Een al opgeslagen naam (zonder @) wordt alleen met hoofdletter teruggegeven.
 */
export function medewerkerNaam(waarde?: string | null): string {
  if (!waarde) return '';
  const lokaal = (waarde.includes('@') ? waarde.split('@')[0] : waarde).trim();
  return lokaal ? lokaal.charAt(0).toUpperCase() + lokaal.slice(1) : '';
}
