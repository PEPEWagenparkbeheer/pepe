-- Gegevens uit de officiële HTML-handtekeningen in /emailhandtekeningen.
-- De zichtbare mobiele nummers in enkele bronbestanden waren gekopieerd; de unieke
-- tel:-links zijn als bron van waarheid gebruikt.
update public.medewerkers set
  volledige_naam = 'Joep van den Bergh',
  mobiel = '+31 (0)6 512 68 702',
  handtekening_foto_url = 'https://pepewagenparkbeheer.nl/app/uploads/2025/11/Joep.png'
where lower(naam) = 'joep';

update public.medewerkers set
  volledige_naam = 'Perke Pellis',
  mobiel = '+31 (0)6 250 078 34',
  handtekening_foto_url = 'https://pepewagenparkbeheer.nl/app/uploads/2025/10/Perke.png'
where lower(naam) = 'perke';

update public.medewerkers set
  volledige_naam = 'Jasper van der Aa',
  mobiel = '+31 (0)6 835 58 530',
  handtekening_foto_url = 'https://pepewagenparkbeheer.nl/app/uploads/2025/11/Jasper.png'
where lower(naam) = 'jasper';

update public.medewerkers set
  volledige_naam = 'Kevin Pollemans',
  mobiel = '+31 (0)6 319 92 844',
  handtekening_foto_url = 'https://pepewagenparkbeheer.nl/app/uploads/2025/11/Kevin.png'
where lower(naam) = 'kevin';

update public.medewerkers set
  volledige_naam = 'Roger van Gastel',
  mobiel = '+31 (0)6 245 76 349',
  handtekening_foto_url = 'https://pepewagenparkbeheer.nl/app/uploads/2025/11/Roger.png'
where lower(naam) = 'roger';
