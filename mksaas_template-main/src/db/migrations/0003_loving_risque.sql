ALTER TABLE "payment" ADD COLUMN "session_id" text;--> statement-breakpoint
CREATE INDEX "payment_session_id_idx" ON "payment" USING btree ("session_id");