create table if not exists public.inname_formulieren (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- Koppeling
  kenteken         text not null default '',
  meldcode         text,
  after_sales_id   uuid references public.after_sales(id) on delete set null,

  -- Algemene gegevens
  datum            date,
  inname_door      text,

  -- Voertuiggegevens
  merk_type        text,
  brandstof        text,

  -- Kilometer / onderhoud / APK
  km_stand         integer,
  laatste_beurt_datum date,
  laatste_beurt_km integer,
  apk_geldig_tot   date,

  -- Tankinhoud
  tankinhoud       text,   -- leeg | kwart | half | driekwart | vol

  -- Banden
  band_lv          text,
  band_rv          text,
  band_la          text,
  band_ra          text,
  band_seizoen     text,   -- zomer | winter | all-season
  bandenmaat       text,

  -- Schade / bijzonderheden
  items            jsonb default '{}',   -- {reset, laadkabels, sleutels, trekhaak, matten, alarm}
  schade_diagram   jsonb default '[]',   -- [{x, y, type, symbol}]
  schade_omschrijving text
);

alter table public.inname_formulieren enable row level security;

create policy "Authenticated users can manage inname_formulieren"
  on public.inname_formulieren
  for all
  to authenticated
  using (true)
  with check (true);
