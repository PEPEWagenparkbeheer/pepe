-- Lease klanten (normen per klant)
create table if not exists lease_klanten (
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

-- Lease aanvragen
create table if not exists lease_aanvragen (
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
  in_btw_lijst boolean default false
);

alter table lease_aanvragen enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on lease_aanvragen
  for all using (auth.role() = 'authenticated');
