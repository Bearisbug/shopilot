DROP INDEX "feishu_delivery_segment_kind_uq";--> statement-breakpoint
ALTER TABLE "draft" ADD COLUMN "translation" text;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD COLUMN "seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_delivery_segment_kind_seq_uq" ON "feishu_delivery" USING btree ("segment_id","kind","seq") WHERE "feishu_delivery"."segment_id" is not null;