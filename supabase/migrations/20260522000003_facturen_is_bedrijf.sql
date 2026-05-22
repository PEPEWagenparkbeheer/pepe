-- Onderscheid bedrijf-klant vs particuliere berijder. Bij particulier
-- skip de Company-aanmaak in HubSpot om duplicaten te voorkomen.
alter table facturen
  add column if not exists is_bedrijf boolean default true;
