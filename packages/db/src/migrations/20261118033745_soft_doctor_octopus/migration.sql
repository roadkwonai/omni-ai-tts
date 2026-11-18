CREATE TABLE "script" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"work_id" uuid,
	"channel_id" uuid,
	"work" jsonb NOT NULL,
	"body" text NOT NULL,
	"paragraph_count" integer NOT NULL,
	"char_count" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_kind" CHECK ("kind" in ('saved', 'recent')),
	CONSTRAINT "script_shape" CHECK (("kind" = 'saved' and "title" is not null and "work_id" is null) or ("kind" = 'recent' and "title" is null and "work_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "script_classification" (
	"script_id" uuid,
	"classification_id" uuid,
	CONSTRAINT "script_classification_pk" PRIMARY KEY("script_id","classification_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "script_title" ON "script" ("owner_id",lower("title")) WHERE "kind" = 'saved';--> statement-breakpoint
CREATE UNIQUE INDEX "script_recent_work" ON "script" ("owner_id","work_id") WHERE "kind" = 'recent';--> statement-breakpoint
CREATE INDEX "script_owner_list" ON "script" ("owner_id","kind","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "script_channel" ON "script" ("channel_id");--> statement-breakpoint
CREATE INDEX "script_title_trgm" ON "script" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "script_body_trgm" ON "script" USING gin ("body" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "script_classification_classification" ON "script_classification" ("classification_id");--> statement-breakpoint
ALTER TABLE "script" ADD CONSTRAINT "script_channel_id_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "script_classification" ADD CONSTRAINT "script_classification_script_id_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "script"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "script_classification" ADD CONSTRAINT "script_classification_classification_id_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "classification"("id") ON DELETE CASCADE;