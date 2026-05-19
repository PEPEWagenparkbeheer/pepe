-- created_at kolom ontbreekt in productie lease_aanvragen tabel
alter table lease_aanvragen add column if not exists created_at timestamptz default now();
