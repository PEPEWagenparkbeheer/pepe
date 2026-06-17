-- P1: afscherming per tabel (security review #1 — "elke ingelogde leest alles").
--
-- is_pepe(): account is een ACTIEVE medewerker uit de `medewerkers`-tabel en geen partner.
-- BEWUST NIET op e-maildomein: sommige partners hebben ook een @pepewagenparkbeheer.nl
-- adres (bv. robin@, kurdo@), dus een domeincheck zou hen ten onrechte staf-toegang geven.
-- partner_wie(): de partnernaam uit user_metadata (hoofdletters), voor rij-afscherming.
--
-- Stafdata: alleen is_pepe(). after_sales + werk_derden: is_pepe() OF eigen partner-rijen
-- (partner-portaal). Helpers zijn SECURITY DEFINER waar ze `medewerkers` lezen, zodat de
-- strenge RLS op die tabel geen recursie geeft.

create or replace function public.is_pepe()
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select (auth.jwt() -> 'user_metadata' ->> 'rol') is distinct from 'partner'
     and exists (
       select 1 from public.medewerkers m
       where lower(m.email) = lower(auth.jwt() ->> 'email')
         and coalesce(m.actief, true)
     );
$fn$;

create or replace function public.partner_wie()
returns text
language sql stable
as $fn$
  select upper(auth.jwt() -> 'user_metadata' ->> 'wie');
$fn$;

-- Mag de ingelogde partner deze after_sales-rij zien? (rijklaar-partner of toegewezen/klaar)
create or replace function public.partner_match_as(wie_rijklaar text, toeg jsonb, klaar jsonb)
returns boolean
language sql stable
as $fn$
  select public.partner_wie() is not null and (
       upper(coalesce(wie_rijklaar, '')) = public.partner_wie()
    or exists (select 1 from jsonb_array_elements_text(coalesce(toeg,  '[]'::jsonb)) e where upper(e) = public.partner_wie())
    or exists (select 1 from jsonb_array_elements_text(coalesce(klaar, '[]'::jsonb)) e where upper(e) = public.partner_wie())
  );
$fn$;

-- ── Staf-only tabellen: alle bestaande policies weg, RLS aan, alleen is_pepe() ──
do $do$
declare t text; p record;
begin
  foreach t in array array[
    'lease_klanten','lease_aanvragen','btw_records','leads','facturen',
    'inname_formulieren','medewerkers','partner_lijst','as_klachten',
    'tenders','tender_results','brein_messages','zoekopdrachten'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "pepe_all" on public.%I for all to authenticated using (public.is_pepe()) with check (public.is_pepe())', t);
  end loop;
end
$do$;

-- ── after_sales: PEPE alles, partner ziet/bewerkt eigen toegewezen rijen ──
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='after_sales' loop
    execute format('drop policy %I on public.after_sales', p.policyname);
  end loop;
end $do$;
alter table public.after_sales enable row level security;
create policy "as_pepe_all" on public.after_sales
  for all to authenticated using (public.is_pepe()) with check (public.is_pepe());
create policy "as_partner_select" on public.after_sales
  for select to authenticated
  using (public.partner_match_as(wie_rijklaar, partners_toegewezen, partners_klaar));
create policy "as_partner_update" on public.after_sales
  for update to authenticated
  using (public.partner_match_as(wie_rijklaar, partners_toegewezen, partners_klaar))
  with check (public.partner_match_as(wie_rijklaar, partners_toegewezen, partners_klaar));

-- ── werk_derden: PEPE alles, partner ziet/maakt/bewerkt eigen rijen ──
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='werk_derden' loop
    execute format('drop policy %I on public.werk_derden', p.policyname);
  end loop;
end $do$;
alter table public.werk_derden enable row level security;
create policy "wd_pepe_all" on public.werk_derden
  for all to authenticated using (public.is_pepe()) with check (public.is_pepe());
create policy "wd_partner_select" on public.werk_derden
  for select to authenticated using (upper(partner) = public.partner_wie());
create policy "wd_partner_insert" on public.werk_derden
  for insert to authenticated with check (upper(partner) = public.partner_wie());
create policy "wd_partner_update" on public.werk_derden
  for update to authenticated
  using (upper(partner) = public.partner_wie())
  with check (upper(partner) = public.partner_wie());
