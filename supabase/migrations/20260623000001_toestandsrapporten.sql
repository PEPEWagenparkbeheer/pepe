-- Tabel voor toestandsrapporten (buitenlandse auto-inspectierapporten)
create table if not exists toestandsrapporten (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  bestandsnaam     text,
  pdf_storage_path text,

  -- herkende auto
  merk             text,
  model            text,
  kenteken         text,
  km_stand         text,

  -- analyse
  conclusie        text,
  bijzonderheden   jsonb,    -- RapportBijzonderheid[]
  ruwe_analyse     jsonb,    -- volledige LLM-output

  -- meta
  door             text,
  gearchiveerd     boolean not null default false
);

create index if not exists toestandsrapporten_created_idx
  on toestandsrapporten(created_at desc);

-- RLS
alter table toestandsrapporten enable row level security;

create policy "toestandsrapporten_pepe"
  on toestandsrapporten
  for all
  to authenticated
  using (public.is_pepe())
  with check (public.is_pepe());

-- Private storage bucket
insert into storage.buckets (id, name, public)
  values ('toestandsrapporten', 'toestandsrapporten', false)
  on conflict (id) do nothing;

-- RLS op storage
create policy "toestandsrapporten_read_pepe"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'toestandsrapporten' and public.is_pepe());

create policy "toestandsrapporten_insert_pepe"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'toestandsrapporten' and public.is_pepe());

create policy "toestandsrapporten_delete_pepe"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'toestandsrapporten' and public.is_pepe());
