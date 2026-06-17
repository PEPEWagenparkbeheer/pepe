-- P0 noodrem (security review Every Day, 17-06-2026, bevinding #3).
-- De tabel `zoekopdrachten` was nooit via een migratie aangemaakt en had daardoor
-- GEEN Row Level Security: anoniem lezen/schrijven/verwijderen was mogelijk.
-- Hier zetten we RLS aan en beperken tot ingelogde gebruikers. In de P1-sweep
-- wordt dit verder aangescherpt naar alleen PEPE-medewerkers (is_pepe()).

alter table public.zoekopdrachten enable row level security;

drop policy if exists "zoekopdrachten authenticated" on public.zoekopdrachten;

create policy "zoekopdrachten authenticated" on public.zoekopdrachten
  for all
  to authenticated
  using (true)
  with check (true);
