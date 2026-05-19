-- Herstel lease_aanvragen + lease_klanten naar het juiste schema.
-- De productie-tabel had bigint id's (Excel-import legacy) en mismatch veldnamen
-- (akkoord_op vs akkoord_datum, aangemaakt_op vs created_at). Code verwacht uuid id's
-- en het schema in 20250430000005_lease.sql.

begin;

-- Helper om legacy date-strings veilig te parsen (geeft NULL bij ongeldig)
create or replace function _try_parse_date(s text) returns date as $$
begin
  if s is null or trim(s) = '' then return null; end if;
  begin
    if s ~ '^\d{4}-\d{1,2}-\d{1,2}' then
      return s::date;
    elsif s ~ '^\d{1,2}-\d{1,2}-\d{4}$' then
      return to_date(s, 'DD-MM-YYYY');
    end if;
    return null;
  exception when others then
    return null;
  end;
end;
$$ language plpgsql immutable;

-- 1. Hernoem bestaande tabellen naar _legacy als backup
alter table if exists lease_aanvragen rename to lease_aanvragen_legacy;
alter table if exists lease_klanten   rename to lease_klanten_legacy;

-- 2. Maak nieuwe lease_klanten met correct schema
create table lease_klanten (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  naam text not null,
  looptijd text,
  jaarkilometrage text,
  banden text,
  eigen_risico text,
  vervangend_vervoer boolean default false,
  brandstofvoorschot boolean default false,
  notities text
);

alter table lease_klanten enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on lease_klanten
  for all using (auth.role() = 'authenticated');

-- 3. Maak nieuwe lease_aanvragen met correct schema
create table lease_aanvragen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  klant_id uuid references lease_klanten(id) on delete set null,
  klant_naam text not null,
  berijder text,

  merk text,
  model text,

  leasemaatschappij text,
  leasenormbedrag numeric,
  leasetarief numeric,

  verdiensten_lm numeric,
  verdiensten_lm_pct numeric,
  verdiensten_dealer numeric,
  verdiensten_dealer_pct numeric,

  looptijd text,
  jaarkilometrage text,
  banden text,
  eigen_risico text,
  vervangend_vervoer boolean default false,
  brandstofvoorschot boolean default false,

  inkoper text,
  offerte_verstuurd boolean default false,
  verwachte_leverdatum date,
  notities text,

  akkoord boolean default false,
  akkoord_door text,
  akkoord_datum text,
  verkocht boolean default false,
  verkocht_op date,
  in_btw_lijst boolean default false,

  status text default 'nieuw'
);

alter table lease_aanvragen enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on lease_aanvragen
  for all using (auth.role() = 'authenticated');

-- 4. Migreer data uit legacy met veilige type-casts
insert into lease_klanten (naam, looptijd, jaarkilometrage, banden,
                           eigen_risico, vervangend_vervoer, brandstofvoorschot, notities)
select
  naam,
  looptijd,
  jaarkilometrage,
  banden,
  eigen_risico,
  coalesce(vervangend_vervoer, false),
  coalesce(brandstofvoorschot, false),
  notities
from lease_klanten_legacy
where naam is not null and trim(naam) <> '';

insert into lease_aanvragen (
  created_at, klant_naam, berijder, merk, model,
  leasemaatschappij, leasenormbedrag, leasetarief,
  verdiensten_lm, verdiensten_lm_pct, verdiensten_dealer, verdiensten_dealer_pct,
  looptijd, jaarkilometrage, banden, eigen_risico,
  vervangend_vervoer, brandstofvoorschot,
  inkoper, offerte_verstuurd, verwachte_leverdatum, notities,
  akkoord, akkoord_datum, verkocht, verkocht_op, in_btw_lijst,
  status
)
select
  coalesce(created_at, now()),
  klant_naam,
  berijder,
  merk,
  model,
  leasemaatschappij,
  nullif(leasenormbedrag, '')::numeric,
  nullif(leasetarief, '')::numeric,
  nullif(verdiensten_lm, '')::numeric,
  nullif(verdiensten_lm_pct, '')::numeric,
  nullif(verdiensten_dealer, '')::numeric,
  nullif(verdiensten_dealer_pct, '')::numeric,
  looptijd,
  jaarkilometrage,
  banden,
  eigen_risico,
  coalesce(vervangend_vervoer, false),
  coalesce(brandstofvoorschot, false),
  inkoper,
  coalesce(offerte_verstuurd, false),
  _try_parse_date(verwachte_leverdatum),
  notities,
  coalesce(akkoord, false),
  nullif(akkoord_op, ''),
  coalesce(verkocht, false),
  _try_parse_date(verkocht_op),
  coalesce(in_btw_lijst, false),
  case
    when verkocht = true then 'verkocht'
    when akkoord = true then 'akkoord_klant'
    when offerte_verstuurd = true then 'offerte'
    else 'nieuw'
  end
from lease_aanvragen_legacy
where klant_naam is not null and trim(klant_naam) <> '';

-- 5. Helper-functie weer opruimen
drop function _try_parse_date(text);

commit;
