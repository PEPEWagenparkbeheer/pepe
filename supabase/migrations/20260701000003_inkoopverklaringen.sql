-- Inkoopverklaringen centraal opslaan (was localStorage → alleen zichtbaar voor de
-- maker). Nu een gedeelde tabel zodat alle PEPE-medewerkers dezelfde lijst zien.

create table if not exists public.inkoopverklaringen (
  id                   uuid primary key default gen_random_uuid(),
  nummer               text,                       -- bijv. "2026-2001"
  data                 jsonb not null default '{}',-- de InkoopForm (voertuig + verkoper-NAW)
  docusign_envelope_id text,
  docusign_status      text,
  docusign_sent_at     timestamptz,
  aangemaakt_door      text,
  created_at           timestamptz not null default now()
);

alter table public.inkoopverklaringen enable row level security;

-- Alle PEPE-medewerkers mogen lezen/schrijven; partners niet.
drop policy if exists inkoopverkl_pepe_all on public.inkoopverklaringen;
create policy inkoopverkl_pepe_all on public.inkoopverklaringen
  for all to authenticated
  using (public.is_pepe())
  with check (public.is_pepe());

-- Volgend documentnummer: jaar + oplopend, per jaar vanaf 2001. Afgeleid van de
-- bestaande verklaringen (dus consistent, ook na migratie van lokale data).
create or replace function public.next_inkoopverklaring_nummer()
returns text
language sql
security definer
set search_path = public
as $$
  select (extract(year from now())::int)::text || '-' || lpad((
    coalesce(
      (select max(nullif(split_part(nummer, '-', 2), '')::int)
         from public.inkoopverklaringen
        where nummer like (extract(year from now())::int)::text || '-%'),
      2000
    ) + 1
  )::text, 4, '0');
$$;

grant execute on function public.next_inkoopverklaring_nummer() to authenticated;
