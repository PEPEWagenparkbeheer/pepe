-- Import-facturatie: koppeling tussen uitgaande_facturen en after_sales + BPM-velden.
-- Defensief: kan meermaals draaien.

-- Koppeling: de factuur wijst naar de after_sales-rij (facturatie-views queryen uitgaande_facturen).
ALTER TABLE public.uitgaande_facturen
  ADD COLUMN IF NOT EXISTS after_sales_id uuid REFERENCES public.after_sales(id) ON DELETE SET NULL;

-- Max. 1 factuur per auto (dubbele-koppeling-bescherming op DB-niveau).
CREATE UNIQUE INDEX IF NOT EXISTS uf_after_sales_uniq
  ON public.uitgaande_facturen (after_sales_id) WHERE after_sales_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS uf_after_sales_idx
  ON public.uitgaande_facturen (after_sales_id);

-- After-sales-kant: volledig chassis (VIN), definitief rest-BPM-bedrag, idempotentie-sleutel
-- voor het Belastingdienst-betaalbericht ('bpmbericht:<message-id>').
ALTER TABLE public.after_sales ADD COLUMN IF NOT EXISTS chassis text;
ALTER TABLE public.after_sales ADD COLUMN IF NOT EXISTS rest_bpm numeric(10,2);
ALTER TABLE public.after_sales ADD COLUMN IF NOT EXISTS rest_bpm_bron_ref text;
