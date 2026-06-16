/**
 * Partner e-mailadressen voor WerkDerden-notificaties.
 * Uitbreidbaar: voeg nieuwe partners hier toe.
 */
const PARTNER_MAILS: Record<string, string> = {
  JORA: 'robin@joraoudenbosch.nl',
  Kurdo: 'info@aboutcarsgroup.nl',
};

/** Geeft het e-mailadres van de partner, of null als onbekend. */
export function getPartnerMail(partner: string): string | null {
  return PARTNER_MAILS[partner] ?? null;
}
