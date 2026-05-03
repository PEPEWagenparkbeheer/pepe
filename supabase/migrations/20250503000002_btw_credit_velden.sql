alter table btw_records add column if not exists lm_pct numeric;
alter table btw_records add column if not exists lm_bedrag numeric;
alter table btw_records add column if not exists dealer_pct numeric;
alter table btw_records add column if not exists dealer_bedrag numeric;
alter table btw_records add column if not exists verwachte_leverdatum date;
