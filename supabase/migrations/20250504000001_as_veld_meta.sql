-- Tijdstempel + gebruiker per afgevinkt veld
ALTER TABLE after_sales ADD COLUMN IF NOT EXISTS veld_meta JSONB DEFAULT '{}';
