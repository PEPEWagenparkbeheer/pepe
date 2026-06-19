-- Autokosten-regels: één rij per werkzaamheid op een werkplaatsfactuur.
-- Maakt toekomstige analyse/voorspelmodel mogelijk (totale kosten per kenteken over tijd).

create table if not exists autokosten_regels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  factuur_id uuid references facturen(id) on delete cascade,
  kenteken text,
  hubspot_deal_id text,
  factuurdatum date,
  omschrijving text not null,
  categorie text,   -- onderhoud|banden|remmen|apk|schade|olie|overig
  bedrag numeric(12,2) not null,
  aantal numeric(10,2) default 1
);

create index if not exists autokosten_regels_kenteken_idx on autokosten_regels(kenteken);
create index if not exists autokosten_regels_deal_idx    on autokosten_regels(hubspot_deal_id);
create index if not exists autokosten_regels_factuur_idx on autokosten_regels(factuur_id);

alter table autokosten_regels enable row level security;

do $$ begin
  create policy "auth only" on autokosten_regels
    for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
