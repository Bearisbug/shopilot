CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "knowledge_qa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"questions" text[] NOT NULL,
	"answer" text NOT NULL,
	"product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"stage" text NOT NULL,
	"markets" jsonb DEFAULT '["ALL"]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"source_document_id" uuid,
	"source_excerpt" text,
	"duplicate_of" uuid,
	"reject_reason" text,
	"embedding" vector(1024),
	"embedding_model" text,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_listing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"sku" text NOT NULL,
	"product_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "qa_extract_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "qa_extract_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "qa_extract_error" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "qa_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_qa" ADD CONSTRAINT "knowledge_qa_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_qa" ADD CONSTRAINT "knowledge_qa_source_document_id_knowledge_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_qa" ADD CONSTRAINT "knowledge_qa_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_qa" ADD CONSTRAINT "knowledge_qa_reviewed_by_membership_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_listing" ADD CONSTRAINT "product_listing_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_listing" ADD CONSTRAINT "product_listing_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_listing" ADD CONSTRAINT "product_listing_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_qa_merchant_status_idx" ON "knowledge_qa" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_qa_document_idx" ON "knowledge_qa" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "knowledge_qa_embedding_idx" ON "knowledge_qa" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "product_merchant_code_uq" ON "product" USING btree ("merchant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_listing_uq" ON "product_listing" USING btree ("shop_id","external_product_id","sku");--> statement-breakpoint
CREATE INDEX "product_listing_merchant_sku_idx" ON "product_listing" USING btree ("merchant_id","sku");