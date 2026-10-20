CREATE TABLE "issue_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "issue_summary" text;--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "issue_category_id" uuid;--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "issue_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_category" ADD CONSTRAINT "issue_category_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_category_name_uq" ON "issue_category" USING btree ("merchant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_category_builtin_uq" ON "issue_category" USING btree ("merchant_id") WHERE builtin;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_issue_category_id_issue_category_id_fk" FOREIGN KEY ("issue_category_id") REFERENCES "public"."issue_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "issue_category" ("id", "merchant_id", "name", "builtin", "position") SELECT gen_random_uuid(), m."id", d."name", d."name" = '其他', d."position" FROM "merchant" m CROSS JOIN (VALUES ('物流查询', 0), ('退换货与退款', 1), ('产品使用与故障', 2), ('商品咨询（库存、规格、价格）', 3), ('优惠与活动', 4), ('开票', 5), ('订单修改与取消', 6), ('其他', 7)) AS d("name", "position") ON CONFLICT DO NOTHING;
