CREATE TABLE "security_audit" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"org_id" text,
	"subject" text,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "security_audit_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
REVOKE UPDATE, DELETE ON security_audit FROM PUBLIC;--> statement-breakpoint
REVOKE UPDATE, DELETE ON security_audit FROM accesscore_app;
