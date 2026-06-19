-- Gegenereerde/bewerkte BREIN-reactie bij de lead bewaren zodat hij na sluiten,
-- verversen en opnieuw openen beschikbaar blijft.
alter table public.leads
  add column if not exists concept_antwoord text,
  add column if not exists concept_inruil boolean not null default false;
