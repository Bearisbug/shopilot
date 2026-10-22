CREATE TABLE "ai_quality_week" (
	"merchant_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"assist_sent" integer DEFAULT 0 NOT NULL,
	"assist_edited" integer DEFAULT 0 NOT NULL,
	"assist_ignored" integer DEFAULT 0 NOT NULL,
	"shadow_same" integer DEFAULT 0 NOT NULL,
	"shadow_partial" integer DEFAULT 0 NOT NULL,
	"shadow_different" integer DEFAULT 0 NOT NULL,
	"ai_segments" integer DEFAULT 0 NOT NULL,
	"ai_handoffs" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_quality_week_merchant_id_week_start_pk" PRIMARY KEY("merchant_id","week_start")
);
--> statement-breakpoint
DROP INDEX "learning_task_agent_segment_uq";--> statement-breakpoint
ALTER TABLE "learning_task" ADD COLUMN "kind" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_task" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "agent_autoapply_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "agent_autoapply_pause_reason" text;--> statement-breakpoint
ALTER TABLE "ai_quality_week" ADD CONSTRAINT "ai_quality_week_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_task_card_review_day_uq" ON "learning_task" USING btree ("target_card_id",(("created_at" at time zone 'UTC')::date)) WHERE "learning_task"."kind" = 'card_review';--> statement-breakpoint
CREATE UNIQUE INDEX "learning_task_agent_segment_uq" ON "learning_task" USING btree ("segment_id") WHERE "learning_task"."source" = 'agent' and "learning_task"."kind" = 'conversation';