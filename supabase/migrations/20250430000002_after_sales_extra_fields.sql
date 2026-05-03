-- Voeg ontbrekende kolommen toe aan after_sales
alter table after_sales
  add column if not exists email_klant text,
  add column if not exists tijdstip_levering text,
  add column if not exists klaarmaker_naam text,
  add column if not exists btw_credit boolean default false,
  add column if not exists extra_accessoires text;
