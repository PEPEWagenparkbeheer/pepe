-- Facturen inbox: binnenkomende verkoopfacturen die handmatig
-- goedgekeurd worden voor wegschrijven naar HubSpot.
create table if not exists facturen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Postmark meta
  ontvangen_op timestamptz,
  postmark_message_id text,
  afzender text,
  onderwerp text,
  raw_email text,

  -- PDF
  pdf_storage_path text,
  pdf_bestandsnaam text,

  -- Geëxtraheerde / aangevulde velden
  factuurnummer text,
  factuurdatum date,
  kenteken text,
  bedrijfsnaam text,
  kvk text,
  berijder_naam text,
  berijder_email text,
  bedrag_excl_btw numeric(12,2),
  bedrag_incl_btw numeric(12,2),
  extracted_data jsonb,
  rdw_data jsonb,

  -- Workflow
  status text not null default 'nieuw',
  wie text,
  notitie text,

  -- HubSpot resultaat
  hubspot_company_id text,
  hubspot_contact_id text,
  hubspot_deal_id text,
  hubspot_synced_at timestamptz,
  hubspot_error text,

  gearchiveerd boolean not null default false,
  veld_meta jsonb
);

create index if not exists facturen_status_idx on facturen(status, gearchiveerd);
create index if not exists facturen_ontvangen_idx on facturen(ontvangen_op desc);
create index if not exists facturen_kenteken_idx on facturen(kenteken);

alter table facturen enable row level security;

create policy "auth only" on facturen
  for all
  using (auth.role() = 'authenticated');

-- updated_at trigger
create or replace function facturen_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists facturen_updated_at on facturen;
create trigger facturen_updated_at
  before update on facturen
  for each row execute function facturen_touch_updated_at();

-- Private storage bucket voor PDF-bestanden.
insert into storage.buckets (id, name, public)
values ('facturen', 'facturen', false)
on conflict (id) do nothing;

-- Geauthenticeerde gebruikers mogen lezen (voor signed URLs in UI);
-- service-role schrijft via inbound-webhook.
create policy "facturen pdf read auth"
  on storage.objects for select
  using (bucket_id = 'facturen' and auth.role() = 'authenticated');
