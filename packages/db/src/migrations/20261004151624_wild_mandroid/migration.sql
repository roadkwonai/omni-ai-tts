CREATE TABLE "provider_cooldown" (
	"provider" text PRIMARY KEY,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_list_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text,
	"provider" text NOT NULL,
	"list_kind" text NOT NULL,
	"params_key" text NOT NULL,
	"contract_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_list_cache_key" UNIQUE NULLS NOT DISTINCT("owner_id","provider","list_kind","params_key","contract_version")
);
