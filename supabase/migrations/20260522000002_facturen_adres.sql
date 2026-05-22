-- Adresgegevens uit factuur toevoegen aan facturen-tabel
-- Worden geëxtraheerd door Groq en doorgegeven aan HubSpot Company.
alter table facturen
  add column if not exists straat text,
  add column if not exists postcode text,
  add column if not exists plaats text,
  add column if not exists land text;
