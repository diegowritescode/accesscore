CREATE TABLE "relation_tuples" (
	"org_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"object_id" text NOT NULL,
	"relation" text NOT NULL,
	"subject" text NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "relation_tuples_org_id_namespace_object_id_relation_subject_pk" PRIMARY KEY("org_id","namespace","object_id","relation","subject")
);
--> statement-breakpoint
ALTER TABLE "relation_tuples" ADD CONSTRAINT "relation_tuples_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relation_tuples_subject_idx" ON "relation_tuples" USING btree ("org_id","subject");--> statement-breakpoint
CREATE INDEX "relation_tuples_revision_idx" ON "relation_tuples" USING btree ("revision");