-- After Sales auto's
create table if not exists after_sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- Basisinfo
  kenteken text not null,
  merk text,
  model text,
  klant text,
  type text,
  platen text,
  notitie text,

  -- In behandeling
  wie_levert_af text,
  afleverdatum date,
  binnen boolean default false,
  aflevercontrole boolean default false,
  status text,

  -- Import checklist
  aangevraagd boolean default false,
  transportdatum date,
  betaald boolean default false,
  rdw_ingeschreven boolean default false,
  bpm_ingediend boolean default false,
  bpm_goedgekeurd boolean default false,
  bin_ontvangen boolean default false,
  kentekenbewijzen boolean default false,
  gelangenbest boolean default false,

  -- Rijklaar maken
  wie_rijklaar text,
  proefrit boolean default false,
  apk text,
  terugroep text,
  accessoires text,
  klaar boolean default false,

  -- Geplande aflevering
  factuur boolean default false,
  poetsen boolean default false,
  hubspot boolean default false,
  taken_notitie text,

  -- Archief
  afgeleverd_op date,
  wie_heeft_afgeleverd text,
  gearchiveerd boolean default false
);

-- Row Level Security
alter table after_sales enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on after_sales
  for all using (auth.role() = 'authenticated');

-- Nalevering / Klachten
create table if not exists as_klachten (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  auto_id uuid references after_sales(id) on delete set null,
  kenteken text not null,
  merk_model text,
  klant text,
  omschrijving text not null,
  oplossing text,
  status text default 'open',
  opgelost_op text,
  door_wie text
);

alter table as_klachten enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on as_klachten
  for all using (auth.role() = 'authenticated');
