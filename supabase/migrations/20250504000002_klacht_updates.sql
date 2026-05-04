-- Updates/verloop voor klachten
ALTER TABLE as_klachten ADD COLUMN IF NOT EXISTS updates JSONB DEFAULT '[]';
