-- Roll back period_key changes if the rollout needs to be reverted.
-- Usage:
--   psql $DATABASE_URL -f scripts/sql/rollback_period_key.sql
DROP INDEX IF EXISTS credit_transaction_user_type_period_key_idx;
ALTER TABLE IF EXISTS credit_transaction
  DROP COLUMN IF EXISTS period_key;
