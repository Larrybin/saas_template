CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_account_id_idx" ON "account" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_provider_id_idx" ON "account" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "credit_transaction_user_id_idx" ON "credit_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transaction_type_idx" ON "credit_transaction" USING btree ("type");--> statement-breakpoint
CREATE INDEX "payment_type_idx" ON "payment" USING btree ("type");--> statement-breakpoint
CREATE INDEX "payment_price_id_idx" ON "payment" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX "payment_user_id_idx" ON "payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_customer_id_idx" ON "payment" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_subscription_id_idx" ON "payment" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "user" USING btree ("id");--> statement-breakpoint
CREATE INDEX "user_customer_id_idx" ON "user" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_credit_user_id_idx" ON "user_credit" USING btree ("user_id");