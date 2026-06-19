-- Persoonlijke gegevens voor de dynamische e-mailhandtekening van leadbehandelaars.
alter table public.medewerkers
  add column if not exists volledige_naam text,
  add column if not exists mobiel text,
  add column if not exists handtekening_foto_url text;

-- Alleen gegevens invullen die betrouwbaar in de bestaande PEPE-signatures/code staan.
update public.medewerkers
set volledige_naam = 'Joep van den Bergh',
    mobiel = '+31 (0)6 512 68 702'
where lower(naam) = 'joep';

update public.medewerkers
set volledige_naam = 'Lorenzo van der Linden',
    mobiel = '+31 (0)6 156 20 933'
where lower(naam) = 'lorenzo';

update public.medewerkers
set volledige_naam = 'Perke Pellis'
where lower(naam) = 'perke' and volledige_naam is null;

update public.medewerkers
set volledige_naam = naam
where volledige_naam is null;
