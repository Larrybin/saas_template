CREATE TABLE IF NOT EXISTS "stripe_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_subscription_id_unique" ON "payment" USING btree ("subscription_id") WHERE "subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_session_id_unique" ON "payment" USING btree ("session_id") WHERE "session_id" IS NOT NULL;
