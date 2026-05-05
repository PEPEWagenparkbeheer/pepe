insert into medewerkers (naam, email, actief) values
  ('Roger',   'roger@pepewagenparkbeheer.nl',   true),
  ('Kevin',   'kevin@pepewagenparkbeheer.nl',   true),
  ('Lorenzo', 'lorenzo@pepewagenparkbeheer.nl', true),
  ('Perke',   'perke@pepewagenparkbeheer.nl',   true)
on conflict (email) do nothing;
