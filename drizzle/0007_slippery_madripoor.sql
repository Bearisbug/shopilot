CREATE TABLE "dev_knowledge_stub" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"next" text DEFAULT 'normal' NOT NULL,
	"sticky" boolean DEFAULT false NOT NULL,
	"last_query" jsonb,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"no" integer NOT NULL,
	"remote_id" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"markets" jsonb DEFAULT '["ALL"]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"failure_reason" text,
	"uploaded_by" uuid,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_index" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"instance_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_index_instance_name_unique" UNIQUE("instance_name")
);
--> statement-breakpoint
CREATE TABLE "knowledge_part" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"part_no" integer NOT NULL,
	"page_from" integer,
	"page_to" integer,
	"item_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "knowledge_part_item_key_unique" UNIQUE("item_key")
);
--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "insufficient" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "retrieval" jsonb;--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "citations" jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_category" ADD CONSTRAINT "knowledge_category_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_part_id_knowledge_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."knowledge_part"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_category_id_knowledge_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_uploaded_by_membership_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_index" ADD CONSTRAINT "knowledge_index_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_part" ADD CONSTRAINT "knowledge_part_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_part" ADD CONSTRAINT "knowledge_part_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_category_name_uq" ON "knowledge_category" USING btree ("merchant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_category_builtin_uq" ON "knowledge_category" USING btree ("merchant_id") WHERE builtin;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunk_document_no_uq" ON "knowledge_chunk" USING btree ("document_id","no");--> statement-breakpoint
CREATE INDEX "knowledge_chunk_remote_idx" ON "knowledge_chunk" USING btree ("merchant_id","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_sha_uq" ON "knowledge_document" USING btree ("merchant_id","sha256") WHERE status <> 'deleting';--> statement-breakpoint
CREATE INDEX "knowledge_document_merchant_idx" ON "knowledge_document" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_document_category_idx" ON "knowledge_document" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_part_document_uq" ON "knowledge_part" USING btree ("document_id","part_no");--> statement-breakpoint
-- 已有商户补建内置分类「未分类」（DESIGN §25）；新商户由 provisionMerchant 建
INSERT INTO "knowledge_category" ("id", "merchant_id", "name", "builtin") SELECT gen_random_uuid(), "id", '未分类', true FROM "merchant" WHERE "status" <> 'deleted' ON CONFLICT DO NOTHING;
