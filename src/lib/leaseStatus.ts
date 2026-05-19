import type { LeaseAanvraag } from '@/types';

export type LeaseStatus = 'nieuw' | 'offerte' | 'akkoord_klant' | 'verkocht';

export const STATUS_LABEL: Record<LeaseStatus, string> = {
  nieuw:         'In aanvraag',
  offerte:       'Offerte verstuurd',
  akkoord_klant: 'Akkoord klant',
  verkocht:      'Verkocht',
};

export function getStatus(r: LeaseAanvraag): LeaseStatus {
  if (r.verkocht) return 'verkocht';
  if (r.status === 'akkoord_klant') return 'akkoord_klant';
  if (r.status === 'offerte' || r.offerte_verstuurd) return 'offerte';
  return 'nieuw';
}
