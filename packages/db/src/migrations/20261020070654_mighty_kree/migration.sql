CREATE TABLE "channel_default_preset" (
	"channel_id" uuid PRIMARY KEY,
	"preset_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_preset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"saved_voice_id" uuid,
	"settings" jsonb NOT NULL,
	"channel_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_preset_provider" CHECK ("provider" in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_default_preset_preset" ON "channel_default_preset" ("preset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_preset_name" ON "voice_preset" ("owner_id",lower("name"));--> statement-breakpoint
CREATE INDEX "voice_preset_saved_voice" ON "voice_preset" ("saved_voice_id");--> statement-breakpoint
CREATE INDEX "voice_preset_channel" ON "voice_preset" ("channel_id");--> statement-breakpoint
ALTER TABLE "channel_default_preset" ADD CONSTRAINT "channel_default_preset_channel_id_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_default_preset" ADD CONSTRAINT "channel_default_preset_preset_id_voice_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "voice_preset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "voice_preset" ADD CONSTRAINT "voice_preset_saved_voice_id_saved_voice_id_fkey" FOREIGN KEY ("saved_voice_id") REFERENCES "saved_voice"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "voice_preset" ADD CONSTRAINT "voice_preset_channel_id_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE SET NULL;