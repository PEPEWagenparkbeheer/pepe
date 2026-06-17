-- P0 noodrem vervolg (security review #3).
-- De vorige migratie zette RLS aan + een authenticated-policy, maar op `zoekopdrachten`
-- stond al een te ruime policy (USING (true) voor de public/anon-rol, buiten de
-- migratie-historie om aangemaakt). Policies worden ge-OR'd, dus anon bleef lezen.
-- Hier verwijderen we ALLE bestaande policies, ontnemen anon de tabelrechten en
-- bouwen één schone policy: alleen ingelogde gebruikers.

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'zoekopdrachten'
  loop
    execute format('drop policy %I on public.zoekopdrachten', p.policyname);
  end loop;
end $$;

alter table public.zoekopdrachten enable row level security;

-- Defense-in-depth: anon (en de algemene anonieme toegang) krijgt geen tabelrechten meer.
revoke all on public.zoekopdrachten from anon;

create policy "zoekopdrachten authenticated" on public.zoekopdrachten
  for all
  to authenticated
  using (true)
  with check (true);
