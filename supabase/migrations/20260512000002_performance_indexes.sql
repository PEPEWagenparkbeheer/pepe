-- Indexes op veelgebruikte filterkolommen voor betere queryprestaties bij groeiende data

CREATE INDEX IF NOT EXISTS after_sales_gearchiveerd_idx  ON after_sales (gearchiveerd);
CREATE INDEX IF NOT EXISTS after_sales_type_idx          ON after_sales (type);
CREATE INDEX IF NOT EXISTS after_sales_afleverdatum_idx  ON after_sales (afleverdatum);

CREATE INDEX IF NOT EXISTS leads_gearchiveerd_idx        ON leads (gearchiveerd);
CREATE INDEX IF NOT EXISTS leads_status_idx              ON leads (status);

CREATE INDEX IF NOT EXISTS btw_records_gearchiveerd_idx  ON btw_records (gearchiveerd);
