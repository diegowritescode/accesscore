CREATE TABLE "flattened_membership_sets" (
	"org_id" uuid NOT NULL,
	"set_type" text NOT NULL,
	"set_id" text NOT NULL,
	"set_relation" text NOT NULL,
	"valid_at_revision" bigint NOT NULL,
	CONSTRAINT "flattened_membership_sets_org_id_set_type_set_id_set_relation_pk" PRIMARY KEY("org_id","set_type","set_id","set_relation")
);
--> statement-breakpoint
CREATE TABLE "flattened_memberships" (
	"org_id" uuid NOT NULL,
	"set_type" text NOT NULL,
	"set_id" text NOT NULL,
	"set_relation" text NOT NULL,
	"member_type" text NOT NULL,
	"member_id" text NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "flattened_memberships_org_id_set_type_set_id_set_relation_member_type_member_id_pk" PRIMARY KEY("org_id","set_type","set_id","set_relation","member_type","member_id")
);
--> statement-breakpoint
CREATE TABLE "index_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"revision" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flattened_membership_sets" ADD CONSTRAINT "flattened_membership_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flattened_memberships" ADD CONSTRAINT "flattened_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;