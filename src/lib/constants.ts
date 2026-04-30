export const SK = 'asp_v5';
export const INKOPERS_KEY = 'asp_inkopers';
export const INKOPERS_DEFAULT = ['Joep', 'Diego', 'Jasper'];

export const KLEUR_MAP: Record<string, string> = {
  Zwart: '#111',
  Wit: '#e8e8e8',
  Grijs: '#888',
  Zilver: '#b0b0bb',
  Antraciet: '#3c3c3c',
  Blauw: '#2563eb',
  Rood: '#dc2626',
  Groen: '#166534',
  'Bruin/Beige': '#a07850',
};

export const KLEUREN = Object.keys(KLEUR_MAP);

export const OPTIES = [
  { k: 'pano', l: 'Panoramadak' },
  { k: 'trekhaak', l: 'Trekhaak' },
  { k: 'acc', l: 'ACC' },
  { k: 'carplay', l: 'CarPlay' },
  { k: 'leder', l: 'Leder' },
  { k: 'camera', l: 'Camera' },
  { k: 'automaat', l: 'Automaat' },
  { k: 'hud', l: 'Head-up' },
  { k: 'luchtvering', l: 'Luchtvering' },
];

export const PROG = [
  { k: 'uitgewerkt', l: 'Uitgewerkt' },
  { k: 'terugkoppeling', l: 'Terugkoppeling' },
  { k: 'dealer', l: 'Dealer gebeld' },
  { k: 'inkopen', l: 'Inkopen' },
  { k: 'contract', l: 'Contract getekend' },
  { k: 'uitgesteld', l: '⏸ Uitgesteld' },
];

export const BRANDSTOF = [
  { k: 'benzine', l: 'Benzine' },
  { k: 'diesel', l: 'Diesel' },
  { k: 'hybride', l: 'Hybride' },
  { k: 'phev', l: 'Plug-in hybride' },
  { k: 'elektrisch', l: 'Elektrisch' },
];

export const MERKEN_LIJST = [
  'Alfa Romeo', 'Audi', 'BMW', 'Bentley', 'Citroën', 'Cupra', 'Dacia', 'DS', 'Ferrari',
  'Fiat', 'Ford', 'Genesis', 'Honda', 'Hyundai', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini',
  'Land Rover', 'Lexus', 'Lucid', 'Maserati', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi',
  'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Renault', 'Rivian', 'Seat', 'Skoda', 'Smart',
  'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
];
