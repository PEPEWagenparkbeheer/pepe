-- Voeg status-kolom toe aan lease_aanvragen
alter table lease_aanvragen add column if not exists status text default 'nieuw';

-- Backfill bestaande records op basis van huidige boolean velden
update lease_aanvragen set status = 'verkocht' where verkocht = true and (status = 'nieuw' or status is null);
update lease_aanvragen set status = 'offerte' where offerte_verstuurd = true and (status = 'nieuw' or status is null);

