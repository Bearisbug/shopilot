CREATE TABLE "product_info" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"status" text NOT NULL,
	"name" text,
	"image_url" text,
	"price_min" text,
	"price_max" text,
	"currency" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "buyer_avatar_url" text;--> statement-breakpoint
ALTER TABLE "product_info" ADD CONSTRAINT "product_info_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_info" ADD CONSTRAINT "product_info_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_info_shop_product_uq" ON "product_info" USING btree ("shop_id","external_product_id");