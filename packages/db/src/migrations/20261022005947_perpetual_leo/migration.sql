ALTER TABLE "trial_generation" ADD COLUMN "script" jsonb;--> statement-breakpoint
ALTER TABLE "trial_generation" ADD COLUMN "segments" jsonb;--> statement-breakpoint
CREATE INDEX "trial_generation_drama" ON "trial_generation" ("owner_id","created_at" DESC NULLS LAST) WHERE "kind" = 'drama';--> statement-breakpoint
ALTER TABLE "trial_generation" DROP CONSTRAINT "trial_generation_kind", ADD CONSTRAINT "trial_generation_kind" CHECK ("kind" in ('trial', 'studio', 'drama'));