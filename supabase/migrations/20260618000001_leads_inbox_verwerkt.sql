-- Ledger voor de automatische lead-intake uit info@ (zie src/lib/leads/intake.ts).
-- Houdt bij welke Graph-berichten al verwerkt zijn, zodat elke mail één keer door de
-- lead/tender-verwerking gaat en de mailbox-status onaangeroerd blijft.

create table if not exists leads_inbox_verwerkt (
  graph_message_id text primary key,
  mailbox text not null,
  ontvangen_op timestamptz,
  resultaat text,                       -- 'lead' | 'tender' | 'skipped'
  verwerkt_op timestamptz not null default now()
);

-- Alleen de server (service-role) schrijft hierin; service-role omzeilt RLS.
-- Geen policy → geen toegang voor anon/authenticated clients.
alter table leads_inbox_verwerkt enable row level security;
