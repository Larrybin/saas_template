CREATE TABLE "user_lifetime_membership" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "price_id" text NOT NULL,
  "cycle_ref_date" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  "revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_lifetime_membership"
  ADD CONSTRAINT "user_lifetime_membership_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_lifetime_membership_user_price_idx"
  ON "user_lifetime_membership" USING btree ("user_id","price_id");
--> statement-breakpoint
CREATE INDEX "user_lifetime_membership_user_idx"
  ON "user_lifetime_membership" USING btree ("user_id");
