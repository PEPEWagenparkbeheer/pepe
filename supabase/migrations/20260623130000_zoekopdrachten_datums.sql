alter table public.zoekopdrachten
  add column if not exists created_at timestamptz not null default now();
alter table public.zoekopdrachten
  add column if not exists gewenste_rijdatum date;
