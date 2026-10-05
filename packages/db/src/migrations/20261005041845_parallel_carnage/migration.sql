CREATE TABLE "trial_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"combo_key" text NOT NULL,
	"provider" text NOT NULL,
	"voice_id" text NOT NULL,
	"model" text NOT NULL,
	"settings" jsonb NOT NULL,
	"text" text NOT NULL,
	"usage_amount" integer NOT NULL,
	"usage_unit" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"audio" bytea,
	"audio_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trial_generation_request" UNIQUE("owner_id","request_id"),
	CONSTRAINT "trial_generation_provider" CHECK ("provider" in ('typecast', 'elevenlabs', 'fish_audio')),
	CONSTRAINT "trial_generation_status" CHECK ("status" in ('pending', 'done', 'failed', 'unknown')),
	CONSTRAINT "trial_generation_usage_unit" CHECK ("usage_unit" in ('credit', 'byte', 'free')),
	CONSTRAINT "trial_generation_audio" CHECK (("status" = 'done') = ("audio" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trial_generation_one_pending" ON "trial_generation" ("owner_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "trial_generation_find" ON "trial_generation" ("owner_id","combo_key","created_at" DESC NULLS LAST) WHERE "status" = 'done';--> statement-breakpoint
CREATE INDEX "trial_generation_voice" ON "trial_generation" ("owner_id","provider","voice_id","created_at" DESC NULLS LAST);