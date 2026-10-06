CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"memo" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_kind" CHECK ("kind" in ('category', 'type'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_name" ON "channel" ("owner_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "classification_name" ON "classification" ("owner_id","kind",lower("name"));