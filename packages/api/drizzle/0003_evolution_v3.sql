-- Evolution iterations 37-49: webhook deliveries table + graph tags

-- Webhook deliveries (iter 28/37)
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event" text NOT NULL,
	"status_code" integer,
	"success" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");

-- Graph tags column (iter 27)
DO $$ BEGIN
  ALTER TABLE "graphs" ADD COLUMN "tags" text[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
