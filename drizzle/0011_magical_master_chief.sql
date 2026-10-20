ALTER TABLE "feishu_delivery" ADD COLUMN "ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_delivery" ADD CONSTRAINT "feishu_delivery_actor_id_membership_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feishu_delivery_ticket_idx" ON "feishu_delivery" USING btree ("ticket_id");