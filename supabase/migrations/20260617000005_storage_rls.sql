-- P2c: storage-buckets afschermen (IDOR-hardening).
-- Tot nu toe kon ELKE ingelogde gebruiker (ook een andere partner) bestanden in de
-- 'facturen'- en 'werk-derden'-buckets lezen. Nu:
--   facturen     → alleen PEPE-medewerkers (is_pepe()).
--   werk-derden  → PEPE alles; een partner alleen bijlagen die bij een werk_derden-rij
--                  van henzelf horen (join op bijlage_storage_path = storage.objects.name).

-- SECURITY DEFINER: omzeilt RLS op werk_derden zodat de policy geen recursie geeft.
create or replace function public.mag_wd_bijlage(p text)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select public.is_pepe()
      or exists (
        select 1 from public.werk_derden w
        where w.bijlage_storage_path = p
          and upper(w.partner) = public.partner_wie()
      );
$fn$;

-- facturen-bucket: alleen PEPE.
drop policy if exists "facturen pdf read auth" on storage.objects;
drop policy if exists "facturen_read_pepe"   on storage.objects;
create policy "facturen_read_pepe" on storage.objects
  for select to authenticated
  using (bucket_id = 'facturen' and public.is_pepe());

-- werk-derden-bucket: PEPE alles, partner alleen eigen bijlagen.
drop policy if exists "wd_storage_select"      on storage.objects;
drop policy if exists "wd_storage_read_scoped" on storage.objects;
create policy "wd_storage_read_scoped" on storage.objects
  for select to authenticated
  using (bucket_id = 'werk-derden' and public.mag_wd_bijlage(name));
