CREATE TABLE "relation_tuple_changelog" (
	"org_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"op" text NOT NULL,
	"namespace" text NOT NULL,
	"object_id" text NOT NULL,
	"relation" text NOT NULL,
	"subject" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "relation_tuple_changelog_org_id_revision_namespace_object_id_relation_subject_pk" PRIMARY KEY("org_id","revision","namespace","object_id","relation","subject")
);
--> statement-breakpoint
ALTER TABLE "relation_tuple_changelog" ADD CONSTRAINT "relation_tuple_changelog_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
REVOKE UPDATE, DELETE ON relation_tuple_changelog FROM PUBLIC;--> statement-breakpoint
REVOKE UPDATE, DELETE ON relation_tuple_changelog FROM accesscore_app;