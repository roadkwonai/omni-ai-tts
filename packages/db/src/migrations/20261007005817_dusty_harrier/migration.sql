CREATE TABLE "saved_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"voice_id" text NOT NULL,
	"source" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"frequent" boolean DEFAULT false NOT NULL,
	"memo" text,
	"voice" jsonb NOT NULL,
	"unavailable" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_voice_voice" UNIQUE("owner_id","provider","voice_id"),
	CONSTRAINT "saved_voice_provider" CHECK ("provider" in ('typecast', 'elevenlabs', 'fish_audio')),
	CONSTRAINT "saved_voice_source" CHECK ("source" in ('public', 'account'))
);
--> statement-breakpoint
CREATE TABLE "saved_voice_channel" (
	"saved_voice_id" uuid,
	"channel_id" uuid,
	CONSTRAINT "saved_voice_channel_pk" PRIMARY KEY("saved_voice_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "saved_voice_classification" (
	"saved_voice_id" uuid,
	"classification_id" uuid,
	CONSTRAINT "saved_voice_classification_pk" PRIMARY KEY("saved_voice_id","classification_id")
);
--> statement-breakpoint
CREATE INDEX "saved_voice_owner_saved" ON "saved_voice" ("owner_id","saved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_voice_channel_channel" ON "saved_voice_channel" ("channel_id");--> statement-breakpoint
CREATE INDEX "saved_voice_classification_classification" ON "saved_voice_classification" ("classification_id");--> statement-breakpoint
ALTER TABLE "saved_voice_channel" ADD CONSTRAINT "saved_voice_channel_saved_voice_id_saved_voice_id_fkey" FOREIGN KEY ("saved_voice_id") REFERENCES "saved_voice"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_voice_channel" ADD CONSTRAINT "saved_voice_channel_channel_id_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_voice_classification" ADD CONSTRAINT "saved_voice_classification_saved_voice_id_saved_voice_id_fkey" FOREIGN KEY ("saved_voice_id") REFERENCES "saved_voice"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_voice_classification" ADD CONSTRAINT "saved_voice_classification_Iosn6VL0xLDp_fkey" FOREIGN KEY ("classification_id") REFERENCES "classification"("id") ON DELETE CASCADE;