alter table after_sales add column if not exists partners_toegewezen jsonb default '[]';
alter table after_sales add column if not exists partners_klaar jsonb default '[]';
