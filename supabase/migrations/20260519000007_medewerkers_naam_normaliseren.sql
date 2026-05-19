-- Normaliseer medewerker-namen: trim spaties + eerste letter hoofdletter (joep → Joep)
update medewerkers
set naam = upper(substring(trim(naam) from 1 for 1)) || substring(trim(naam) from 2)
where naam is not null
  and trim(naam) <> ''
  and naam <> upper(substring(trim(naam) from 1 for 1)) || substring(trim(naam) from 2);
