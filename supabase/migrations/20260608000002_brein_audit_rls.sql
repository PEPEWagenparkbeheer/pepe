-- BREIN: audit-stamps (wie deed wat) + UPDATE-policy
-- Zonder UPDATE-policy konden ingelogde gebruikers statussen niet opslaan
-- (RLS stond alleen SELECT toe). Daarnaast leggen we per bericht vast wie
-- het laatst heeft behandeld en houden we een historie bij.

-- Wie heeft het bericht het laatst behandeld (medewerkersnaam/e-mail).
alter table brein_messages
  add column if not exists behandeld_door text;

-- Historie: lijst van { status, op (ISO-tijd), door } stappen.
alter table brein_messages
  add column if not exists historie jsonb not null default '[]'::jsonb;

-- Ingelogde medewerkers mogen berichten bijwerken (status, behandeling, concept).
-- Service role had al 'for all'; dit voegt de authenticated-rol toe.
drop policy if exists "Ingelogde gebruikers mogen brein_messages bijwerken" on brein_messages;
create policy "Ingelogde gebruikers mogen brein_messages bijwerken"
  on brein_messages for update
  to authenticated
  using (true)
  with check (true);
