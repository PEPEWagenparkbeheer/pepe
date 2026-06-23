-- Voeg created_at en gewenste_rijdatum toe aan zoekopdrachten.
-- created_at: automatische tijdstempel bij aanmaken (server-default)
-- gewenste_rijdatum: datum waarop de klant wenst te rijden

alter table public.zoekopdrachten
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists gewenste_rijdatum date;
