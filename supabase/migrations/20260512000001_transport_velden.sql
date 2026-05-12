-- TransConnect integratie velden op after_sales
ALTER TABLE after_sales
  ADD COLUMN IF NOT EXISTS transport_order_id text,
  ADD COLUMN IF NOT EXISTS transport_status   text,
  ADD COLUMN IF NOT EXISTS transport_status_updated_at timestamptz;
