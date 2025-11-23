CREATE TABLE "ai_usage" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "feature" text NOT NULL,
  "period_key" integer NOT NULL,
  "used_calls" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);--> statement-breakpoint
ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_user_feature_period_key_idx"
  ON "ai_usage" USING btree ("user_id","feature","period_key");

