CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"resource_type" text NOT NULL,
	"action" text NOT NULL,
	"condition" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policies_target_idx" ON "policies" USING btree ("org_id","resource_type","action");--> statement-breakpoint
CREATE INDEX "policies_revision_idx" ON "policies" USING btree ("revision");