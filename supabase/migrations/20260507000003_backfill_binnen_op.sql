-- Backfill binnen_op from veld_meta for records where binnen=true but binnen_op is null
update after_sales
set binnen_op = (veld_meta->'binnen'->>'op')::date
where binnen = true
  and binnen_op is null
  and veld_meta->'binnen'->>'op' is not null;
