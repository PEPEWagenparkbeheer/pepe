-- Partner-velden voor rijklaar-portaal
alter table after_sales add column if not exists partner_datum date;
alter table after_sales add column if not exists partner_onderdelen_besteld boolean default false;
alter table after_sales add column if not exists partner_updates jsonb default '[]';
