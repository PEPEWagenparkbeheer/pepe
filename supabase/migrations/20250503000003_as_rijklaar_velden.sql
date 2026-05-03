alter table after_sales add column if not exists wie_rijklaar_klaar boolean default false;
alter table after_sales add column if not exists proefrit_op date;
alter table after_sales add column if not exists binnen_op date;
alter table after_sales add column if not exists accessoires_klaar text;
