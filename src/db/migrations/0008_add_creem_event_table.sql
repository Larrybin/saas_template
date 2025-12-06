CREATE TABLE IF NOT EXISTS "creem_event" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "processed_at" timestamp,
  "payload" text NOT NULL
);
--> statement-breakpoint

