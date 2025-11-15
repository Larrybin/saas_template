-- Detect duplicate period_key combinations and legacy records.
-- Usage:
--   psql $DATABASE_URL -f scripts/sql/check_period_key_conflicts.sql

-- Duplicates per (user_id, type, period_key)
SELECT user_id,
       type,
       period_key,
       COUNT(*)    AS occurrences
FROM credit_transaction
WHERE period_key > 0
GROUP BY user_id, type, period_key
HAVING COUNT(*) > 1
ORDER BY occurrences DESC
LIMIT 50;

-- Legacy rows that still have period_key = 0 despite feature flag being enabled.
SELECT COUNT(*) AS rows_without_period_key
FROM credit_transaction
WHERE period_key = 0;
