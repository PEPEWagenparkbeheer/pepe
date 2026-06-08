-- BREIN: mail-berichten tabel
-- Slaat verwerkte e-mails op van de fues@pepewagenparkbeheer.nl mailbox.
-- graph_message_id is de Microsoft Graph ID – uniek per bericht.

create table if not exists brein_messages (
  id                  uuid primary key default gen_random_uuid(),

  -- Graph identifiers
  graph_message_id    text not null unique,
  mailbox             text not null,

  -- Mail metadata
  onderwerp           text,
  afzender_email      text,
  afzender_naam       text,
  ontvangen_op        timestamptz,
  body_preview        text,
  body_html           text,

  -- Claude classificatie
  categorie           text,           -- contract_vraag | schade | aflevering | retour | overig | ...
  prioriteit          text not null default 'normaal',  -- laag | normaal | hoog | urgent
  samenvatting        text,           -- kort AI-samenvatting van het bericht

  -- HubSpot & voertuig koppeling
  hubspot_deal_id     text,
  hubspot_company_id  text,
  kenteken            text,

  -- Afhandeling
  status              text not null default 'nieuw',    -- nieuw | concept_klaar | verzonden | genegeerd
  concept_antwoord    text,
  verzonden_op        timestamptz,

  -- Tijdstempels
  verwerkt_op         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Indexen voor veelgebruikte queries
create index if not exists brein_messages_status_idx
  on brein_messages (status);

create index if not exists brein_messages_ontvangen_op_idx
  on brein_messages (ontvangen_op desc);

create index if not exists brein_messages_kenteken_idx
  on brein_messages (kenteken)
  where kenteken is not null;

create index if not exists brein_messages_mailbox_idx
  on brein_messages (mailbox);

-- Auto-update updated_at
create or replace function brein_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brein_messages_updated_at
  before update on brein_messages
  for each row execute function brein_set_updated_at();

-- RLS
alter table brein_messages enable row level security;

create policy "Ingelogde gebruikers mogen brein_messages lezen"
  on brein_messages for select
  to authenticated
  using (true);

create policy "Service role mag alles"
  on brein_messages for all
  to service_role
  using (true);
