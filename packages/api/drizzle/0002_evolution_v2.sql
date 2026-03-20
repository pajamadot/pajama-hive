-- Evolution iterations 7-36: new tables and columns

-- Task startedAt column (iter 7)
ALTER TABLE "tasks" ADD COLUMN "started_at" timestamp;

-- Task logs table (iter 7)
CREATE TABLE "task_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"stream" text DEFAULT 'stdout' NOT NULL,
	"chunk" text NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_logs_task_seq_idx" ON "task_logs" USING btree ("task_id","seq");

-- Graph tags + isTemplate columns (iter 8, 27)
ALTER TABLE "graphs" ADD COLUMN "tags" text[];
ALTER TABLE "graphs" ADD COLUMN "is_template" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "graphs_template_idx" ON "graphs" USING btree ("is_template");

-- API keys table (iter 16)
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");

-- Webhooks table (iter 16)
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhooks_user_idx" ON "webhooks" USING btree ("user_id");

-- Webhook deliveries table (iter 28)
CREATE TABLE "webhook_deliveries" (
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
CREATE INDEX "deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");

-- Graph snapshots table (iter 13)
CREATE TABLE "graph_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"run_id" text NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "graph_snapshots" ADD CONSTRAINT "graph_snapshots_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "graph_snapshots" ADD CONSTRAINT "graph_snapshots_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "snapshots_graph_idx" ON "graph_snapshots" USING btree ("graph_id");
--> statement-breakpoint
CREATE INDEX "snapshots_run_idx" ON "graph_snapshots" USING btree ("run_id");
