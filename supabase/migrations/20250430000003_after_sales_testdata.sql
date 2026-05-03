-- Testdata voor after_sales
insert into after_sales (
  kenteken, merk, model, klant, type, platen, wie_levert_af, wie_rijklaar,
  afleverdatum, tijdstip_levering, notitie, binnen, aflevercontrole, klaar,
  aangevraagd, betaald, rdw_ingeschreven, bpm_ingediend, bpm_goedgekeurd,
  bin_ontvangen, kentekenbewijzen, gelangenbest, transportdatum,
  proefrit, apk, terugroep, accessoires, extra_accessoires,
  factuur, poetsen, hubspot, taken_notitie,
  btw_credit, email_klant, status, gearchiveerd
) values

-- 1. Import auto in behandeling
('XV-123-K', 'BMW', 'X5 xDrive40e', 'Jan de Vries', 'import', 'Besteld',
 'Joep', 'Diego', '2026-05-15', '14:00', 'Klant wil extra trekhaak gemonteerd',
 true, false, false,
 true, true, true, true, false,
 false, false, false, '2026-05-10',
 false, '15-08-2027', '', 'Trekhaak',  'Mattenset zwart',
 false, false, false, 'Afspraak dealergarage voor trekhaak',
 true, 'jan.devries@gmail.com', 'in_behandeling', false),

-- 2. NL auto bijna rijklaar
('AB-456-C', 'Audi', 'Q5 45 TFSI', 'Sandra Pietersen', 'nl', 'Ontvangen',
 'Diego', 'Joep', '2026-05-08', '10:30', 'Klant wil witte kentekenplaten',
 true, true, false,
 false, false, false, false, false,
 false, false, false, null,
 true, '22-03-2027', 'Terugroepactie N47', 'Alarm,Matten', 'Dashcam besteld',
 true, false, true, 'Poetsen inplannen voor donderdag',
 false, 'sandra.p@hotmail.com', 'rijklaar', false),

-- 3. Nieuw — aflevering gepland
('ZZ-789-T', 'Volkswagen', 'ID.4 Pro', 'Mohamed El Amrani', 'nieuw', 'Gemonteerd',
 'Jasper', 'Jasper', '2026-05-03', '09:00', '',
 true, true, true,
 false, false, false, false, false,
 false, false, false, null,
 true, '01-01-2099', '', 'Voertuigvolg,Matten', '',
 true, true, true, '',
 true, 'm.elamrani@outlook.com', 'klaar', false),

-- 4. Voorraad auto — geen klant
('KL-321-P', 'Mercedes-Benz', 'C 300 e AMG Line', null, 'voorraad', '',
 '', '', null, null, 'Staat op terrein, wacht op inspectie',
 false, false, false,
 false, false, false, false, false,
 false, false, false, null,
 false, '', '', 'Alarm keuren', '',
 false, false, false, 'APK laten keuren',
 false, null, 'nieuw', false),

-- 5. Import — bijna volledig doorgelopen checklist
('RT-654-M', 'Tesla', 'Model Y Long Range', 'Fatima Boukhari', 'import', 'Ontvangen',
 'Joep', 'Diego', '2026-05-20', '11:00', 'Batterij check laten doen',
 true, false, false,
 true, true, true, true, true,
 true, true, false, '2026-05-18',
 false, '05-06-2028', '', 'Alarm,Voertuigvolg', 'Laadkabel type 2',
 false, false, false, 'BIN wachten op antwoord',
 true, 'fatima.b@gmail.com', 'in_behandeling', false),

-- 6. Gearchiveerde auto
('GH-111-R', 'Porsche', 'Cayenne E-Hybrid', 'Robert Klaassen', 'import', 'Gemonteerd',
 'Diego', 'Diego', '2026-04-10', '13:00', 'Soepel verlopen aflevering',
 true, true, true,
 true, true, true, true, true,
 true, true, true, '2026-04-05',
 true, '12-04-2027', '', 'Alarm,Trekhaak,Matten', '',
 true, true, true, '',
 true, 'r.klaassen@business.nl', 'klaar', true);

-- Testdata voor klachten
insert into as_klachten (
  kenteken, merk_model, klant, omschrijving, oplossing, status, door_wie
) values
('AB-456-C', 'Audi Q5', 'Sandra Pietersen',
 'Airco blaast niet koud na aflevering', '',
 'open', 'Joep'),
('GH-111-R', 'Porsche Cayenne', 'Robert Klaassen',
 'Kleine kras op achterspatbord geconstateerd bij aflevering',
 'Gespoten bij Autolak Tilburg, klant akkoord',
 'opgelost', 'Diego');
