-- Zorg dat akkoord_door kolom bestaat (stond wel in schema maar niet in productie)
alter table lease_aanvragen add column if not exists akkoord_door text;

-- Normaliseer bestaande inkoper- en akkoord_door-namen:
-- trim spaties en zet eerste letter op hoofdletter (joep → Joep)

update lease_aanvragen
set inkoper = upper(substring(trim(inkoper) from 1 for 1)) || substring(trim(inkoper) from 2)
where inkoper is not null
  and trim(inkoper) <> ''
  and inkoper <> upper(substring(trim(inkoper) from 1 for 1)) || substring(trim(inkoper) from 2);

update lease_aanvragen
set akkoord_door = upper(substring(trim(akkoord_door) from 1 for 1)) || substring(trim(akkoord_door) from 2)
where akkoord_door is not null
  and trim(akkoord_door) <> ''
  and akkoord_door <> upper(substring(trim(akkoord_door) from 1 for 1)) || substring(trim(akkoord_door) from 2);
