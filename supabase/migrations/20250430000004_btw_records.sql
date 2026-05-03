-- BTW / Credit records
create table if not exists btw_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  auto text not null,
  type text,
  klant text,
  dealer_verkoper text,
  ingekocht_op date,

  bedrag numeric,

  gelangenbest_verstuurd boolean default false,
  geld_van_lm boolean default false,
  geld_van_dealer boolean default false,

  opmerkingen text,
  inkoper text,
  gearchiveerd boolean default false
);

alter table btw_records enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on btw_records
  for all using (auth.role() = 'authenticated');
