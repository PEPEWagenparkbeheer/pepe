-- Voeg after_sales-koppeling, bestemming en voorwaarden toe aan werk_derden.
-- Idempotent: IF NOT EXISTS op alle kolommen en index.

ALTER TABLE public.werk_derden
  ADD COLUMN IF NOT EXISTS after_sales_id UUID REFERENCES public.after_sales(id) ON DELETE SET NULL;

ALTER TABLE public.werk_derden
  ADD COLUMN IF NOT EXISTS bestemming TEXT NOT NULL DEFAULT 'doorbelasten';

ALTER TABLE public.werk_derden
  ADD COLUMN IF NOT EXISTS voorwaarden TEXT;

CREATE INDEX IF NOT EXISTS werk_derden_after_sales_id_idx
  ON public.werk_derden (after_sales_id);
