ALTER TABLE "platform_app" ADD COLUMN "read_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop" ADD COLUMN "pull_cursor_at" timestamp with time zone;