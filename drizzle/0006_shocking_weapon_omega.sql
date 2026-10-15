CREATE TABLE "invoice_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid,
	"legal_name" text,
	"registration_no" text,
	"tax_id_label" text,
	"tax_id" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"notes" text,
	"logo_file_id" uuid,
	"tax_name" text,
	"tax_rate" numeric(5, 2),
	"prices_include_tax" boolean,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_profile" ADD CONSTRAINT "invoice_profile_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_profile" ADD CONSTRAINT "invoice_profile_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_profile" ADD CONSTRAINT "invoice_profile_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_profile_default_uq" ON "invoice_profile" USING btree ("merchant_id") WHERE shop_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_profile_shop_uq" ON "invoice_profile" USING btree ("shop_id");