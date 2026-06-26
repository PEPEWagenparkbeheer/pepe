-- TransConnect: geplande afhaaldatum (ophalen) los van transportdatum (geplande leverdatum)
-- + idempotency-vlag voor de betaal-reminder naar de administratie.
ALTER TABLE after_sales
  ADD COLUMN IF NOT EXISTS geplande_afhaaldatum    date,
  ADD COLUMN IF NOT EXISTS afhaal_reminder_sent_at timestamptz;
