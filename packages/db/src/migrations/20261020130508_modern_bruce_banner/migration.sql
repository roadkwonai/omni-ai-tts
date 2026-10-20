ALTER TABLE "saved_voice" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_voice" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trial_generation" ADD COLUMN "kind" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
CREATE INDEX "trial_generation_studio" ON "trial_generation" ("owner_id","created_at" DESC NULLS LAST) WHERE "kind" = 'studio';--> statement-breakpoint
ALTER TABLE "trial_generation" ADD CONSTRAINT "trial_generation_kind" CHECK ("kind" in ('trial', 'studio'));