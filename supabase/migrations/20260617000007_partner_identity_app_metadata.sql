-- SECURITY-FIX: partner-identiteit uit app_metadata i.p.v. user_metadata.
--
-- Gevonden bij na-review: `user_metadata` is door de gebruiker zelf te wijzigen via
-- auth.updateUser(). De partner-RLS las `user_metadata.wie`, dus een willekeurig ingelogd
-- account kon z'n eigen `wie` op een partnernaam zetten en zo diens rijen lezen.
-- `app_metadata` kan ALLEEN door de service_role/admin gezet worden → niet te vervalsen.
-- Bestaande partner-accounts zijn al gemigreerd (app_metadata gevuld).

-- partner_wie() leest nu app_metadata (met user_metadata-fallback weggehaald).
create or replace function public.partner_wie()
returns text
language sql stable
as $fn$
  select upper(auth.jwt() -> 'app_metadata' ->> 'wie');
$fn$;

-- is_pepe(): rol-guard nu op app_metadata; medewerkers-tabel blijft de bron van waarheid.
create or replace function public.is_pepe()
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select (auth.jwt() -> 'app_metadata' ->> 'rol') is distinct from 'partner'
     and exists (
       select 1 from public.medewerkers m
       where lower(m.email) = lower(auth.jwt() ->> 'email')
         and coalesce(m.actief, true)
     );
$fn$;
