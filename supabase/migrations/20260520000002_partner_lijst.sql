-- Centrale lijst van rijklaar-partners (externe bedrijven/personen).
-- Vervangt de localStorage 'asp_wie' key zodat alle PEPE-medewerkers
-- dezelfde lijst zien.

create table if not exists partner_lijst (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique,
  gearchiveerd boolean default false,
  created_at timestamptz default now()
);

alter table partner_lijst enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on partner_lijst
  for all using (auth.role() = 'authenticated');

-- Seed met de huidige standaard-partners
insert into partner_lijst (naam) values ('JORA'), ('KOLE'), ('KURDO')
on conflict (naam) do nothing;
