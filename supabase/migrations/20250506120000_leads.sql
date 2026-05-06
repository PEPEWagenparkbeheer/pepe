create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  bron text not null default 'anders',
  klant_naam text not null default '',
  email text,
  telefoon text,
  auto text not null default '',
  advertentie_url text,
  bericht text,
  status text not null default 'nieuw',
  wie text,
  notities text,
  vervolgactie text,
  vervolgdatum date,
  gearchiveerd boolean not null default false,
  veld_meta jsonb
);

alter table leads enable row level security;

create policy "auth only" on leads
  for all
  using (auth.role() = 'authenticated');
