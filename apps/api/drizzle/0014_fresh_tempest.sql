CREATE TABLE "mfa_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"algorithm" text DEFAULT 'SHA1' NOT NULL,
	"digits" integer DEFAULT 6 NOT NULL,
	"period" integer DEFAULT 30 NOT NULL,
	"last_used_step" bigint,
	"created_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recovery_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_active_totp_per_user" ON "mfa_credentials" USING btree ("user_id") WHERE "mfa_credentials"."status" = 'active' and "mfa_credentials"."type" = 'totp';--> statement-breakpoint
CREATE INDEX "mfa_credentials_user_idx" ON "mfa_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_active_idx" ON "recovery_codes" USING btree ("user_id") WHERE "recovery_codes"."consumed_at" is null;