-- Tijdelijke backfill: binnen_op = created_at voor records zonder datum
-- Zodat de stadagen-teller iets toont; correcte datum kan per auto via de modal worden ingevuld
update after_sales
set binnen_op = created_at::date
where binnen = true
  and binnen_op is null;
