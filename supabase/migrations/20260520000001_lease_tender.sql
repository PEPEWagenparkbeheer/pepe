-- Lease Tender Automatisering
-- Tabellen voor inkomende aanvragen + per-portaal resultaten

create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  adviseur_id uuid,                  -- optioneel: gekoppeld aan auth.users
  adviseur_naam text,                -- denormalisatie voor UI

  -- Inkomende data
  klant_naam text,
  klant_email text,
  raw_email text,                    -- volledige originele mail

  -- Groq output (gestructureerd)
  parsed_data jsonb,                 -- TenderInput-shape

  -- Leasenorm koppeling (kopie + edits door adviseur)
  leasenorm jsonb,                   -- LeasenormConfig

  -- Status
  status text default 'pending'      -- pending | confirmed | running | done | failed
);

alter table tenders enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on tenders
  for all using (auth.role() = 'authenticated');

create index if not exists tenders_created_at_idx on tenders (created_at desc);
create index if not exists tenders_status_idx on tenders (status);

-- Per portaal resultaat
create table if not exists tender_results (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade,
  created_at timestamptz default now(),

  portaal text not null,             -- 'hiltermann' | 'alphabet' | 'ayvens' | 'arval' | 'mhc'

  -- Status van deze portaal-run
  status text default 'pending',     -- pending | running | completed | failed
  started_at timestamptz,
  finished_at timestamptz,

  -- Resultaten
  maandprijs numeric,
  transparency_check jsonb,          -- TransparencyItem[]
  pdf_url text,                      -- Supabase storage url

  -- Foutafhandeling
  error_message text,

  -- Stagehand session info voor debug
  raw_result jsonb
);

alter table tender_results enable row level security;
create policy "Ingelogde gebruikers kunnen alles" on tender_results
  for all using (auth.role() = 'authenticated');

create index if not exists tender_results_tender_id_idx on tender_results (tender_id);
create index if not exists tender_results_portaal_idx on tender_results (portaal);
