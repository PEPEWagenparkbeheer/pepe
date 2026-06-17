-- P2f / security review #4: voorspelbare, op tijdstempel gebaseerde primary keys.
-- `zoekopdrachten.id` werd client-side als Date.now() (bigint) gezet. De client gebruikt
-- nu crypto.randomUUID() (net als alle andere tabellen). Hier zetten we de kolom om naar
-- text zodat bestaande numerieke ids behouden blijven en nieuwe rijen een uuid krijgen.

alter table public.zoekopdrachten alter column id drop default;
alter table public.zoekopdrachten alter column id type text using id::text;
