CREATE TABLE "decision_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"subject" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"effect" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"revision_used" bigint NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "decision_log_org_created_idx" ON "decision_log" USING btree ("org_id","created_at");