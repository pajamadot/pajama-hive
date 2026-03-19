CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text,
	"run_id" text,
	"task_id" text,
	"worker_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"from_task_id" text NOT NULL,
	"to_task_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"input" text DEFAULT '',
	"output_ref" text,
	"output_summary" text,
	"timeout_ms" integer DEFAULT 900000 NOT NULL,
	"max_retries" integer DEFAULT 2 NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"required_capabilities" text[],
	"agent_kind" text DEFAULT 'cc' NOT NULL,
	"assigned_worker_id" text,
	"lease_id" text,
	"lease_expires_at" timestamp,
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"agent_kinds" text[],
	"capabilities" text[],
	"max_concurrency" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_heartbeat_at" timestamp,
	"version" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_task_id_tasks_id_fk" FOREIGN KEY ("from_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_task_id_tasks_id_fk" FOREIGN KEY ("to_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_graph_created_idx" ON "audit_logs" USING btree ("graph_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_task_idx" ON "audit_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "audit_worker_idx" ON "audit_logs" USING btree ("worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_unique_idx" ON "edges" USING btree ("graph_id","from_task_id","to_task_id");--> statement-breakpoint
CREATE INDEX "edges_graph_idx" ON "edges" USING btree ("graph_id");--> statement-breakpoint
CREATE INDEX "edges_from_idx" ON "edges" USING btree ("from_task_id");--> statement-breakpoint
CREATE INDEX "edges_to_idx" ON "edges" USING btree ("to_task_id");--> statement-breakpoint
CREATE INDEX "graphs_owner_id_idx" ON "graphs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "runs_graph_idx" ON "runs" USING btree ("graph_id");--> statement-breakpoint
CREATE INDEX "tasks_graph_status_idx" ON "tasks" USING btree ("graph_id","status");--> statement-breakpoint
CREATE INDEX "tasks_lease_expires_idx" ON "tasks" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "workers_status_heartbeat_idx" ON "workers" USING btree ("status","last_heartbeat_at");