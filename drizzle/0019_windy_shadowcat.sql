CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"learning_task_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"turns" integer,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"cache_read_tokens" integer,
	"output_tokens" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_learning_task_id_learning_task_id_fk" FOREIGN KEY ("learning_task_id") REFERENCES "public"."learning_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_task_idx" ON "agent_run" USING btree ("learning_task_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_run_running_idx" ON "agent_run" USING btree ("started_at") WHERE "agent_run"."status" = 'running';