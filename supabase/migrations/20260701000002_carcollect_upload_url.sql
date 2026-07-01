-- Deeplink uit de CarCollect-facturatieverzoekmail ("Upload factuur") bewaren op de
-- verkoopfactuur, zodat je (of later Skyvern) met één klik naar de juiste uploadplek gaat.
-- TIJDELIJK: verwijderen zodra de CarCollect-API-upload werkt.
alter table public.uitgaande_facturen
  add column if not exists carcollect_upload_url text;
