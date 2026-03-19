CREATE TABLE "meta_events" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"evidence" jsonb,
	"suggestions" text[],
	"related_graph_id" text,
	"related_run_id" text,
	"related_task_ids" text[],
	"resolved" text DEFAULT 'false',
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_retrospectives" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"graph_id" text NOT NULL,
	"summary" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"tasks_total" integer NOT NULL,
	"tasks_succeeded" integer NOT NULL,
	"tasks_failed" integer NOT NULL,
	"tasks_retried" integer NOT NULL,
	"critical_path_tasks" text[],
	"bottleneck_tasks" jsonb,
	"observations" text[],
	"lessons_learned" text[],
	"suggested_improvements" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"overall_health" text NOT NULL,
	"score_scheduling" integer NOT NULL,
	"score_execution" integer NOT NULL,
	"score_reliability" integer NOT NULL,
	"score_planning" integer NOT NULL,
	"score_evolution" integer NOT NULL,
	"active_workers" integer NOT NULL,
	"active_runs" integer NOT NULL,
	"task_success_rate" real NOT NULL,
	"avg_task_duration_ms" real NOT NULL,
	"plan_acceptance_rate" real NOT NULL,
	"self_improve_prs_merged" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_retrospectives" ADD CONSTRAINT "run_retrospectives_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_retrospectives" ADD CONSTRAINT "run_retrospectives_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_events_kind_idx" ON "meta_events" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "meta_events_severity_idx" ON "meta_events" USING btree ("severity","created_at");--> statement-breakpoint
CREATE INDEX "meta_events_domain_idx" ON "meta_events" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "meta_events_graph_idx" ON "meta_events" USING btree ("related_graph_id");--> statement-breakpoint
CREATE INDEX "retro_run_idx" ON "run_retrospectives" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "retro_graph_idx" ON "run_retrospectives" USING btree ("graph_id");--> statement-breakpoint
CREATE INDEX "snapshot_created_idx" ON "system_snapshots" USING btree ("created_at");