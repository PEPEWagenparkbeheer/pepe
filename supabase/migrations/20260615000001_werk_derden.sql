CREATE TABLE IF NOT EXISTS public.werk_derden (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  partner              TEXT NOT NULL,
  kenteken             TEXT,
  meldcode             TEXT,
  merk                 TEXT,
  model                TEXT,
  klant                TEXT,
  toegevoegd_door      TEXT,

  regels               JSONB NOT NULL DEFAULT '[]',
  btw_pct              NUMERIC(5,2) DEFAULT 21,
  inkoop_bedrag        NUMERIC(12,2),
  marge_type           TEXT,
  marge_waarde         NUMERIC(12,2),
  verkoop_bedrag       NUMERIC(12,2),

  bijlage_storage_path TEXT,

  status               TEXT NOT NULL DEFAULT 'open',
  afkeur_reden         TEXT,
  notitie              TEXT,

  goedgekeurd_op       TIMESTAMPTZ,
  gefactureerd_op      TIMESTAMPTZ,
  hubspot_deal_id      TEXT,
  twinfield_invoice_id TEXT
);

ALTER TABLE public.werk_derden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wd_select" ON public.werk_derden
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "wd_insert" ON public.werk_derden
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "wd_update" ON public.werk_derden
  FOR UPDATE USING (auth.uid() IS NOT NULL);

INSERT INTO storage.buckets (id, name, public)
VALUES ('werk-derden', 'werk-derden', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "wd_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'werk-derden' AND auth.uid() IS NOT NULL);

CREATE POLICY "wd_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'werk-derden' AND auth.uid() IS NOT NULL);
