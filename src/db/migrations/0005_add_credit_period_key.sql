ALTER TABLE "credit_transaction" ADD COLUMN "period_key" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ranked_transactions AS (
  SELECT
    ctid,
    user_id,
    type,
    (date_part('year', created_at)::int * 100 + date_part('month', created_at)::int) AS computed_period_key,
    row_number() OVER (
      PARTITION BY user_id, type, date_part('year', created_at), date_part('month', created_at)
      ORDER BY created_at
    ) AS row_number
  FROM credit_transaction
  WHERE created_at IS NOT NULL
)
UPDATE credit_transaction AS ct
SET period_key = CASE
    WHEN ranked_transactions.row_number = 1 THEN ranked_transactions.computed_period_key
    ELSE 0
  END
FROM ranked_transactions
WHERE ct.ctid = ranked_transactions.ctid;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_user_type_period_key_idx" ON "credit_transaction" USING btree ("user_id","type","period_key") WHERE "credit_transaction"."period_key" > 0;
