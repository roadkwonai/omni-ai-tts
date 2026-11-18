CREATE TABLE "my_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_voice_id" text,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"consent_at" timestamp(3) with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "my_voice_request" UNIQUE("owner_id","request_id"),
	CONSTRAINT "my_voice_provider" CHECK ("provider" in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')),
	CONSTRAINT "my_voice_status" CHECK ("status" in ('sending', 'processing', 'ready', 'failed', 'unknown', 'deleting'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "my_voice_one_sending" ON "my_voice" ("owner_id") WHERE "status" = 'sending';--> statement-breakpoint
CREATE UNIQUE INDEX "my_voice_provider_voice" ON "my_voice" ("provider","provider_voice_id") WHERE "provider_voice_id" is not null;--> statement-breakpoint
CREATE INDEX "my_voice_owner_created" ON "my_voice" ("owner_id","created_at" DESC NULLS LAST);