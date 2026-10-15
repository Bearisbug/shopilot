CREATE TABLE "feishu_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"conversation_id" uuid,
	"segment_id" uuid,
	"kind" text NOT NULL,
	"target_id" uuid,
	"target_name" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"message_id" text,
	"card" jsonb,
	"stub" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feishu_integration" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"app_id" text,
	"app_secret_enc" text,
	"status" text DEFAULT 'verified' NOT NULL,
	"verified_at" timestamp with time zone,
	"notify_unclaimed" boolean DEFAULT true NOT NULL,
	"notify_overdue" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feishu_target" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"chat_id" text,
	"webhook_enc" text,
	"secret_enc" text,
	"webhook_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_target_id_feishu_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."feishu_target"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_integration" ADD CONSTRAINT "feishu_integration_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_target" ADD CONSTRAINT "feishu_target_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_target" ADD CONSTRAINT "feishu_target_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_delivery_segment_kind_uq" ON "feishu_delivery" USING btree ("segment_id","kind") WHERE "feishu_delivery"."segment_id" is not null;--> statement-breakpoint
CREATE INDEX "feishu_delivery_merchant_created_idx" ON "feishu_delivery" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_target_default_uq" ON "feishu_target" USING btree ("merchant_id") WHERE "feishu_target"."shop_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_target_shop_uq" ON "feishu_target" USING btree ("shop_id") WHERE "feishu_target"."shop_id" is not null;