CREATE TABLE "draft_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"segment_id" uuid,
	"kind" text NOT NULL,
	"draft_status" text NOT NULL,
	"human_text" text NOT NULL,
	"human_message_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"edit_class" text NOT NULL,
	"consistency" text NOT NULL,
	"reason" text,
	"evidence" text,
	"model" text NOT NULL,
	"compared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_review_draft_id_unique" UNIQUE("draft_id")
);
--> statement-breakpoint
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_review_merchant_idx" ON "draft_review" USING btree ("merchant_id","kind","edit_class");