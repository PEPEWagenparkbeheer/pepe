insert into medewerkers (naam, email, actief) values
  ('Joep',   'joep@pepewagenparkbeheer.nl',   true),
  ('Diego',  'diego@pepewagenparkbeheer.nl',  true),
  ('Jasper', 'jasper@pepewagenparkbeheer.nl', true)
on conflict (email) do nothing;
