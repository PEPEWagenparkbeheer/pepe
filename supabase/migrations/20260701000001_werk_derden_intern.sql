-- Interne, vooraf afgesproken verkoopprijs/marge voor werk-derden.
-- KRITIEK: staat in een APARTE tabel (niet als kolom op werk_derden) omdat de
-- partner de werk_derden-rij rechtstreeks leest via select('*') + row-level RLS.
-- Postgres RLS kan geen kolommen verbergen, dus elke marge-/verkoopkolom op
-- werk_derden lekt naar de partner. Deze tabel is alleen zichtbaar voor is_pepe().

create table if not exists public.werk_derden_intern (
  werk_derden_id  uuid primary key
                  references public.werk_derden(id) on delete cascade,
  -- 'verkoop' = vast eindbedrag (excl. BTW); 'pct'/'bedrag' = marge bovenop inkoop
  marge_type      text check (marge_type in ('pct','bedrag','verkoop')),
  marge_waarde    numeric(12,2),
  btw_pct         numeric(5,2),
  notitie         text,
  bijgewerkt_op   timestamptz not null default now(),
  bijgewerkt_door text
);

alter table public.werk_derden_intern enable row level security;

-- Alleen PEPE-medewerkers; partners hebben geen enkele policy → geen toegang.
drop policy if exists wdi_pepe_all on public.werk_derden_intern;
create policy wdi_pepe_all on public.werk_derden_intern
  for all to authenticated
  using (public.is_pepe())
  with check (public.is_pepe());

-- Bestaande marge migreren naar de interne tabel (kopie eerst, data blijft behouden).
insert into public.werk_derden_intern (werk_derden_id, marge_type, marge_waarde, btw_pct)
select id, marge_type, marge_waarde, btw_pct
from public.werk_derden
where marge_type is not null or verkoop_bedrag is not null
on conflict (werk_derden_id) do nothing;

-- Lek dichten: gevoelige marge/verkoop van de partner-leesbare rij verwijderen
-- (data staat nu veilig in werk_derden_intern). Kolommen blijven bestaan voor
-- schema-compat, maar worden niet meer gevuld.
update public.werk_derden
set marge_type = null, marge_waarde = null, verkoop_bedrag = null
where marge_type is not null or verkoop_bedrag is not null;
