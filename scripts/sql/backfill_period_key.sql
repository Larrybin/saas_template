-- Backfill credit_transaction.period_key in controllable batches.
-- This script creates a helper function that updates at most `batch_size`
-- rows per call. Invoke repeatedly until it returns 0.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/sql/backfill_period_key.sql
--   psql $DATABASE_URL -c "SELECT backfill_period_key_batch(5000);"   -- repeat until result = 0

CREATE OR REPLACE FUNCTION backfill_period_key_batch(batch_size INTEGER DEFAULT 5000)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_rows INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT
      ctid,
      (date_part('year', created_at)::INT * 100 + date_part('month', created_at)::INT) AS computed_period_key,
      row_number() OVER (
        PARTITION BY user_id, type, date_part('year', created_at), date_part('month', created_at)
        ORDER BY created_at
      ) AS rn
    FROM credit_transaction
    WHERE period_key = 0
    ORDER BY created_at
    LIMIT batch_size
  )
  UPDATE credit_transaction AS ct
  SET period_key = CASE WHEN ranked.rn = 1 THEN ranked.computed_period_key ELSE 0 END
  FROM ranked
  WHERE ct.ctid = ranked.ctid;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RAISE NOTICE '[backfill_period_key] updated % rows in latest batch', updated_rows;
  RETURN updated_rows;
END;
$$;
