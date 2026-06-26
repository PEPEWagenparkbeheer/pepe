-- Uitgaande facturen-module (Auto + Diensten) — gedeeld fundament.
-- Staf-only: RLS met is_pepe(). Service-role API-routes omzeilen RLS en autoriseren zelf
-- via requirePepe(); de policy is de tweede verdedigingslinie.

-- ── Hoofdtabel: uitgaande facturen ──────────────────────────────────────────
create table if not exists public.uitgaande_facturen (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  type                text not null default 'diensten_overig',  -- auto|wagenparkbeheer|shortlease|werk_derden|diensten_overig
  soort               text not null default 'factuur',          -- factuur|creditnota
  status              text not null default 'concept',          -- concept|aanvullen|ter_controle|definitief|verzonden|geannuleerd

  -- Debiteur-snapshot (vastgelegd op factuurmoment; niet live uit HubSpot)
  hubspot_company_id  text,
  klant_naam          text,
  tav                 text,
  adres               text,
  postcode            text,
  plaats              text,
  telefoon            text,
  email               text,
  factuur_email       text,
  kvk                 text,
  btw_nummer          text,
  twinfield_debiteur_code text,

  -- Factuur-identificatie (factuurnummer komt uit Twinfield bij definitief boeken)
  factuurnummer       text,
  twinfield_invoice_id text,
  factuurdatum        date,
  vervaldatum         date,
  betaaltermijn_dagen integer default 14,
  credit_van_factuur_id uuid references public.uitgaande_facturen(id),

  -- Regels + totalen (totalen berekend met Twinfield-rondingsregels)
  regels              jsonb not null default '[]'::jsonb,  -- [{omschrijving,aantal,prijs_excl,btw_code,grootboek}]
  totaal_excl         numeric(12,2) default 0,
  totaal_btw          numeric(12,2) default 0,
  totaal_incl         numeric(12,2) default 0,

  -- Type-specifiek
  voertuig            jsonb,  -- auto: {kenteken,chassis,merk,model,kleur,km_stand,datum_deel1a,bruto_bpm,rest_bpm,bpm_methode,btw_soort}
  bijlage             jsonb,  -- wagenparkbeheer: voertuiglijst per entiteit

  -- Herkomst + recurring-deduplicatie
  bron                text default 'handmatig',  -- handmatig|docusign|recurring
  docusign_envelope_id text,
  periode             text,
  recurring_key       text unique,

  -- Verzending + audit
  pdf_storage_path    text,
  verzonden_op        timestamptz,
  verzonden_naar      text,
  akkoord_door        text,
  notitie             text
);

create index if not exists uf_status_idx   on public.uitgaande_facturen (status);
create index if not exists uf_type_idx     on public.uitgaande_facturen (type);
create index if not exists uf_company_idx  on public.uitgaande_facturen (hubspot_company_id);
create index if not exists uf_periode_idx  on public.uitgaande_facturen (periode);

-- ── Config: wagenparkbeheer-fee per debiteur ────────────────────────────────
create table if not exists public.wagenparkbeheer_config (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  parent_hubspot_company_id text not null,
  klant_naam               text,
  fee_per_voertuig         numeric(10,2) not null default 15.00,
  child_company_ids        jsonb not null default '[]'::jsonb,  -- [{hubspot_company_id, naam}]
  betaaldag                integer default 1,
  actief                   boolean not null default true,
  notitie                  text
);

create unique index if not exists wpc_parent_uniq on public.wagenparkbeheer_config (parent_hubspot_company_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at = now(); return new; end;
$fn$;

drop trigger if exists uf_set_updated_at on public.uitgaande_facturen;
create trigger uf_set_updated_at before update on public.uitgaande_facturen
  for each row execute function public.set_updated_at();

drop trigger if exists wpc_set_updated_at on public.wagenparkbeheer_config;
create trigger wpc_set_updated_at before update on public.wagenparkbeheer_config
  for each row execute function public.set_updated_at();

-- ── RLS: staf-only via is_pepe() ────────────────────────────────────────────
alter table public.uitgaande_facturen   enable row level security;
alter table public.wagenparkbeheer_config enable row level security;

drop policy if exists pepe_all on public.uitgaande_facturen;
create policy pepe_all on public.uitgaande_facturen
  for all to authenticated using (public.is_pepe()) with check (public.is_pepe());

drop policy if exists pepe_all on public.wagenparkbeheer_config;
create policy pepe_all on public.wagenparkbeheer_config
  for all to authenticated using (public.is_pepe()) with check (public.is_pepe());

-- ── Storage: bucket voor factuur-PDF's (staf-only) ──────────────────────────
insert into storage.buckets (id, name, public)
  values ('uitgaande-facturen', 'uitgaande-facturen', false)
  on conflict (id) do nothing;

drop policy if exists uf_storage_select on storage.objects;
create policy uf_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'uitgaande-facturen' and public.is_pepe());

drop policy if exists uf_storage_insert on storage.objects;
create policy uf_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'uitgaande-facturen' and public.is_pepe());
