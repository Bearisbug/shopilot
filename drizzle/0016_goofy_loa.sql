CREATE TABLE "experience_card" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"stage" text NOT NULL,
	"markets" jsonb DEFAULT '["ALL"]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"conditions" text[] NOT NULL,
	"condition_mode" text NOT NULL,
	"steps" jsonb NOT NULL,
	"tips" text,
	"qa_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"source" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"agent_unseen" boolean DEFAULT false NOT NULL,
	"embedding" vector(1024),
	"embedding_model" text,
	"created_by" uuid,
	"updated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "experience_card_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"author" text NOT NULL,
	"member_id" uuid,
	"learning_task_id" uuid,
	"note" text,
	"retest" jsonb,
	"seen_by" uuid,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"segment_id" uuid,
	"source" text NOT NULL,
	"submitted_by" uuid,
	"note" text,
	"messages" jsonb NOT NULL,
	"product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"product_basis" text,
	"product_status" text NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'analyzing' NOT NULL,
	"diagnosis" text,
	"result" text,
	"reason" text,
	"suggestion" text,
	"target_card_id" uuid,
	"proposal" jsonb,
	"similar" jsonb,
	"test" jsonb,
	"retest" jsonb,
	"test_question" text,
	"error" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_card_id" uuid,
	"published_version" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "card" jsonb;--> statement-breakpoint
ALTER TABLE "experience_card" ADD CONSTRAINT "experience_card_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card" ADD CONSTRAINT "experience_card_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card" ADD CONSTRAINT "experience_card_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card_version" ADD CONSTRAINT "experience_card_version_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card_version" ADD CONSTRAINT "experience_card_version_card_id_experience_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."experience_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card_version" ADD CONSTRAINT "experience_card_version_member_id_membership_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card_version" ADD CONSTRAINT "experience_card_version_learning_task_id_learning_task_id_fk" FOREIGN KEY ("learning_task_id") REFERENCES "public"."learning_task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_card_version" ADD CONSTRAINT "experience_card_version_seen_by_membership_id_fk" FOREIGN KEY ("seen_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_submitted_by_membership_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_target_card_id_experience_card_id_fk" FOREIGN KEY ("target_card_id") REFERENCES "public"."experience_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_reviewed_by_membership_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_task" ADD CONSTRAINT "learning_task_published_card_id_experience_card_id_fk" FOREIGN KEY ("published_card_id") REFERENCES "public"."experience_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experience_card_merchant_status_idx" ON "experience_card" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "experience_card_embedding_idx" ON "experience_card" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "experience_card_version_uq" ON "experience_card_version" USING btree ("card_id","version");--> statement-breakpoint
CREATE INDEX "learning_task_merchant_status_idx" ON "learning_task" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "learning_task_conversation_idx" ON "learning_task" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "learning_task_published_card_idx" ON "learning_task" USING btree ("published_card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_task_agent_segment_uq" ON "learning_task" USING btree ("segment_id") WHERE "learning_task"."source" = 'agent';--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_card_id_experience_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."experience_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_card_idx" ON "draft" USING btree ("card_id","created_at");