-- Voeg een gegenereerde kolom toe die het kenteken normaliseert (geen streepjes, hoofdletters)
-- zodat gedeeltelijke kentekenzoekacties werken (bijv. "8845" matcht "XX-88-45")

ALTER TABLE after_sales
  ADD COLUMN IF NOT EXISTS kenteken_clean text
  GENERATED ALWAYS AS (upper(replace(kenteken, '-', ''))) STORED;

CREATE INDEX IF NOT EXISTS after_sales_kenteken_clean_idx
  ON after_sales (kenteken_clean);
