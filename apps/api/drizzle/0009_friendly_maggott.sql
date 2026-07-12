CREATE TABLE "namespace_definitions" (
	"org_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"config" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "namespace_definitions_org_id_namespace_pk" PRIMARY KEY("org_id","namespace")
);
--> statement-breakpoint
ALTER TABLE "namespace_definitions" ADD CONSTRAINT "namespace_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "namespace_definitions_revision_idx" ON "namespace_definitions" USING btree ("revision");