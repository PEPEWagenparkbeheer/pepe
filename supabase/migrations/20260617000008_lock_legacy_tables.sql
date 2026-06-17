-- SECURITY-FIX (na-review, brede tabel-sweep): vier tabellen die niet in het
-- oorspronkelijke rapport stonden en niet door de app worden gebruikt, bleken
-- anoniem leesbaar (RLS uit of te ruim): `aftersales` (legacy, los van after_sales),
-- `lease_aanvragen_legacy`, `lease_klanten_legacy`, `nalevering`.
-- Niet in gebruik door de frontend → veilig dicht te zetten op alleen PEPE-medewerkers.

do $do$
declare t text; p record;
begin
  foreach t in array array[
    'aftersales','lease_aanvragen_legacy','lease_klanten_legacy','nalevering'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "pepe_all" on public.%I for all to authenticated using (public.is_pepe()) with check (public.is_pepe())', t);
  end loop;
end
$do$;
