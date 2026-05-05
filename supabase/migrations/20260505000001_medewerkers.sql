create table if not exists medewerkers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  naam text not null,
  email text not null unique,
  actief boolean default true
);

alter table medewerkers enable row level security;

create policy "medewerkers leesbaar" on medewerkers
  for select using (auth.role() = 'authenticated');

create policy "medewerkers beheerbaar" on medewerkers
  for all using (auth.role() = 'authenticated');
