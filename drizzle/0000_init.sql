-- 全局搜索的消息正文三元组索引依赖 pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "after_sale" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"external_order_id" text NOT NULL,
	"order_id" uuid,
	"buyer_external_id" text,
	"platform_status" text NOT NULL,
	"next_action" text,
	"seller_due_at" timestamp with time zone,
	"due_field" text,
	"reason" text,
	"amount" numeric(14, 2),
	"currency" text,
	"raw" jsonb,
	"platform_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assist_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"stuck_step" text NOT NULL,
	"slot" text NOT NULL,
	"contact_channel" text NOT NULL,
	"contact" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"actor_membership_id" uuid,
	"actor_user_id" text,
	"actor_name" text,
	"actor_source" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"summary" text NOT NULL,
	"data" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_statement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text NOT NULL,
	"invoice_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connect_draft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"step" text DEFAULT 'platform' NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initial_mode" text DEFAULT 'shadow' NOT NULL,
	"shop_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_conversation_id" text NOT NULL,
	"buyer_external_id" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_kind" text DEFAULT 'buyer' NOT NULL,
	"buyer_language" text,
	"handling_state" text NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"handoff_reason" text,
	"current_segment_id" uuid,
	"external_session_id" text,
	"last_message_at" timestamp with time zone,
	"last_buyer_at" timestamp with time zone,
	"last_agent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dev_ai_stub" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"next" text DEFAULT 'normal' NOT NULL,
	"sticky" boolean DEFAULT false NOT NULL,
	"last_request" jsonb,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "draft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"segment_id" uuid,
	"trigger_message_id" uuid,
	"mode" text NOT NULL,
	"text" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"handoff" boolean DEFAULT false NOT NULL,
	"reason" text,
	"status" text NOT NULL,
	"disposed_by" uuid,
	"disposed_at" timestamp with time zone,
	"sent_message_id" uuid,
	"edit_distance" integer,
	"model" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'delivered' NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"file_id" uuid,
	"error" text,
	"requested_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"platform_app_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"shop_id" uuid,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"lease_until" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"shop_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid,
	"conversation_id" uuid,
	"fields" jsonb NOT NULL,
	"pdf_file_id" uuid,
	"image_file_id" uuid,
	"chat_status" text NOT NULL,
	"chat_error" text,
	"chat_message_id" uuid,
	"email_status" text NOT NULL,
	"email_error" text,
	"email_to" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"merchant_id" uuid,
	"email" text NOT NULL,
	"result" text NOT NULL,
	"reason" text,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"preferences" jsonb DEFAULT '{"desktopNotify":false,"sound":true}'::jsonb NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membership_shop" (
	"membership_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	CONSTRAINT "membership_shop_membership_id_shop_id_pk" PRIMARY KEY("membership_id","shop_id")
);
--> statement-breakpoint
CREATE TABLE "merchant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"language" text DEFAULT 'zh-CN' NOT NULL,
	"billing_email" text,
	"owner_user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"purge_at" timestamp with time zone,
	"security_policy" jsonb NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"ticket_auto_close_days" integer DEFAULT 7,
	"invoice_info" jsonb,
	"last_purge_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"segment_id" uuid,
	"external_message_id" text,
	"direction" text NOT NULL,
	"sender_role" text NOT NULL,
	"sent_by" uuid,
	"type" text NOT NULL,
	"text" text,
	"original_text" text,
	"translation" text,
	"translation_source" text,
	"payload" jsonb,
	"client_request_id" text,
	"send_status" text,
	"send_error" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"type" text NOT NULL,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rule" (
	"merchant_id" uuid NOT NULL,
	"event" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_rule_merchant_id_event_pk" PRIMARY KEY("merchant_id","event")
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"shop_id" uuid,
	"shop_region" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_order_id" text NOT NULL,
	"buyer_external_id" text,
	"buyer_name" text,
	"platform_status" text NOT NULL,
	"status_group" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ship_by_at" timestamp with time zone,
	"recipient" jsonb,
	"tracking" jsonb,
	"deadlines" jsonb,
	"platform_created_at" timestamp with time zone NOT NULL,
	"platform_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_transfer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_transfer_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "platform_app" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"app_key" text NOT NULL,
	"secret_enc" text NOT NULL,
	"push_key_enc" text,
	"key_expires_at" date,
	"api_host" text,
	"region" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"callback_state" text DEFAULT 'unset' NOT NULL,
	"callback_current" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prompt_template" (
	"merchant_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "prompt_template_merchant_id_stage_pk" PRIMARY KEY("merchant_id","stage")
);
--> statement-breakpoint
CREATE TABLE "quick_reply" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reception_settings" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"schedule" jsonb NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handoff_keywords" jsonb NOT NULL,
	"confidence_threshold" numeric(3, 2) DEFAULT 0.6 NOT NULL,
	"unclaimed_remind_minutes" integer DEFAULT 10,
	"response_sla_minutes" integer DEFAULT 15 NOT NULL,
	"brand_voice" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_lead" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact" text NOT NULL,
	"note" text,
	"snapshot" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"stage_source" text DEFAULT 'auto' NOT NULL,
	"stage_basis" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"first_claimed_by" uuid,
	"first_buyer_at" timestamp with time zone,
	"first_human_reply_at" timestamp with time zone,
	"first_reply_in_hours" boolean,
	"handed_off" boolean DEFAULT false NOT NULL,
	"ai_replied" boolean DEFAULT false NOT NULL,
	"human_replied" boolean DEFAULT false NOT NULL,
	"ai_resolved" boolean DEFAULT false NOT NULL,
	"backfilled" boolean DEFAULT false NOT NULL,
	"reminded_at" timestamp with time zone,
	"handover_ticketed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence" (
	"merchant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"next" integer NOT NULL,
	CONSTRAINT "sequence_merchant_id_key_pk" PRIMARY KEY("merchant_id","key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_merchant_id" uuid,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shop" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"platform_app_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_shop_id" text NOT NULL,
	"shop_cipher" text,
	"name" text NOT NULL,
	"market" text NOT NULL,
	"main_account_id" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"auth_expires_at" timestamp with time zone,
	"auth_reminded_at" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"backfill" jsonb DEFAULT '{"state":"pending","conversations":0,"orders":0}'::jsonb NOT NULL,
	"metrics" jsonb,
	"metrics_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shop_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_reception" (
	"shop_id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"mode_in_hours" text DEFAULT 'off' NOT NULL,
	"mode_off_hours" text DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"pending_cycle" text,
	"pending_plan_code" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"payment_method" jsonb,
	"overage_policy" text DEFAULT 'stop' NOT NULL,
	"overage_budget" numeric(10, 2),
	"alert_config" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"origin" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"shop_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"order_id" uuid,
	"after_sale_id" uuid,
	"conversation_id" uuid,
	"buyer_name" text,
	"status" text DEFAULT 'open' NOT NULL,
	"waiting_on" text,
	"phase" text,
	"platform_status" text,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"due_source" text,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"source" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_type_config" (
	"merchant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"auto_create" boolean DEFAULT true NOT NULL,
	"merchant_due" jsonb,
	"default_assignee" text NOT NULL,
	"remind" jsonb NOT NULL,
	CONSTRAINT "ticket_type_config_merchant_id_type_pk" PRIMARY KEY("merchant_id","type")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_period" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"drafts_used" integer DEFAULT 0 NOT NULL,
	"quota" integer NOT NULL,
	"topup_quota" integer DEFAULT 0 NOT NULL,
	"alerts_sent" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_after_sale" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"subtype" text NOT NULL,
	"reason" text NOT NULL,
	"reason_text" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"refund_amount" numeric(14, 2) NOT NULL,
	"items" jsonb NOT NULL,
	"deadlines" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"arbitration_status" text,
	"role" text DEFAULT 'BUYER' NOT NULL,
	"return_tracking_number" text,
	"return_carrier" text,
	"records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_app" (
	"platform" text NOT NULL,
	"app_key" text NOT NULL,
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"push_key" text,
	"region" text NOT NULL,
	"main_account_id" text,
	"redirect_url" text,
	"callback_url" text,
	"push_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"push_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_app_platform_app_key_pk" PRIMARY KEY("platform","app_key")
);
--> statement-breakpoint
CREATE TABLE "mock_auth_code" (
	"code" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"app_key" text NOT NULL,
	"shop_ids" jsonb NOT NULL,
	"main_account_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_buyer_thread" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"buyer_im_id" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_avatar" text,
	"language" text NOT NULL,
	"can_send" boolean DEFAULT true NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"session_id" text,
	"session_open" boolean DEFAULT true NOT NULL,
	"started" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_coupon" (
	"coupon_id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_fault" (
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_fault_platform_shop_id_category_pk" PRIMARY KEY("platform","shop_id","category")
);
--> statement-breakpoint
CREATE TABLE "mock_message" (
	"seq" bigserial NOT NULL,
	"message_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"sender" text NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"source_content" jsonb,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_order" (
	"order_id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"buyer_name" text NOT NULL,
	"status" text NOT NULL,
	"prev_status" text,
	"currency" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"shipping_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"items" jsonb NOT NULL,
	"recipient" jsonb NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"package_number" text,
	"logistics_status" text,
	"tracking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deadlines" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"times" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"buyer_message" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"cancel_by" text,
	"cancel_reason" text,
	"buyer_cancel_reason" text,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"pay_time" timestamp with time zone,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_push_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"app_key" text NOT NULL,
	"shop_id" text,
	"event" integer NOT NULL,
	"target_url" text NOT NULL,
	"raw_body" text NOT NULL,
	"body" jsonb NOT NULL,
	"summary" text NOT NULL,
	"http_status" integer,
	"error" text,
	"duration_ms" integer,
	"resend_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_shop" (
	"platform" text NOT NULL,
	"shop_id" text NOT NULL,
	"app_key" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"cipher" text,
	"shop_code" text,
	"main_account_id" text,
	"seller_open_id" text,
	"seller_name" text,
	"currency" text NOT NULL,
	"auth_status" text DEFAULT 'unauthorized' NOT NULL,
	"auth_time" timestamp with time zone,
	"auth_expires_at" timestamp with time zone,
	"access_token" text,
	"access_expires_at" timestamp with time zone,
	"prev_access_token" text,
	"prev_access_expires_at" timestamp with time zone,
	"refresh_token" text,
	"refresh_expires_at" timestamp with time zone,
	"capabilities" jsonb DEFAULT '{"chat":true}'::jsonb NOT NULL,
	"webhooks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"can_accept_chat" boolean DEFAULT true NOT NULL,
	"performance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_shop_platform_shop_id_pk" PRIMARY KEY("platform","shop_id")
);
--> statement-breakpoint
CREATE TABLE "mock_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shop_id" text,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale" ADD CONSTRAINT "after_sale_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale" ADD CONSTRAINT "after_sale_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale" ADD CONSTRAINT "after_sale_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_request" ADD CONSTRAINT "assist_request_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_request" ADD CONSTRAINT "assist_request_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_statement" ADD CONSTRAINT "billing_statement_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_draft" ADD CONSTRAINT "connect_draft_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_claimed_by_membership_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_trigger_message_id_message_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_disposed_by_membership_id_fk" FOREIGN KEY ("disposed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_platform_app_id_platform_app_id_fk" FOREIGN KEY ("platform_app_id") REFERENCES "public"."platform_app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_membership_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_event" ADD CONSTRAINT "login_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_event" ADD CONSTRAINT "login_event_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_shop" ADD CONSTRAINT "membership_shop_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_shop" ADD CONSTRAINT "membership_shop_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sent_by_membership_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rule" ADD CONSTRAINT "notification_rule_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_app" ADD CONSTRAINT "platform_app_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_template" ADD CONSTRAINT "prompt_template_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_reply" ADD CONSTRAINT "quick_reply_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_settings" ADD CONSTRAINT "reception_settings_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lead" ADD CONSTRAINT "sales_lead_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_first_claimed_by_membership_id_fk" FOREIGN KEY ("first_claimed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence" ADD CONSTRAINT "sequence_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_platform_app_id_platform_app_id_fk" FOREIGN KEY ("platform_app_id") REFERENCES "public"."platform_app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_event" ADD CONSTRAINT "shop_event_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_event" ADD CONSTRAINT "shop_event_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_reception" ADD CONSTRAINT "shop_reception_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_reception" ADD CONSTRAINT "shop_reception_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_after_sale_id_after_sale_id_fk" FOREIGN KEY ("after_sale_id") REFERENCES "public"."after_sale"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignee_id_membership_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_actor_id_membership_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_config" ADD CONSTRAINT "ticket_type_config_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_period" ADD CONSTRAINT "usage_period_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "after_sale_shop_kind_ext_uq" ON "after_sale" USING btree ("shop_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "after_sale_order_idx" ON "after_sale" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE INDEX "audit_merchant_created_idx" ON "audit_log" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_merchant_action_idx" ON "audit_log" USING btree ("merchant_id","action","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connect_draft_merchant_platform_uq" ON "connect_draft" USING btree ("merchant_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_shop_ext_uq" ON "conversation" USING btree ("shop_id","external_conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_merchant_state_idx" ON "conversation" USING btree ("merchant_id","handling_state","last_message_at");--> statement-breakpoint
CREATE INDEX "conversation_buyer_idx" ON "conversation" USING btree ("shop_id","buyer_external_id");--> statement-breakpoint
CREATE INDEX "draft_conversation_idx" ON "draft" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "draft_merchant_created_idx" ON "draft" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_key_uq" ON "idempotency_key" USING btree ("merchant_id","route","key");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_event_app_ext_uq" ON "inbound_event" USING btree ("platform_app_id","external_event_id");--> statement-breakpoint
CREATE INDEX "inbound_event_status_idx" ON "inbound_event" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "invitation_merchant_idx" ON "invitation" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_merchant_number_uq" ON "invoice" USING btree ("merchant_id","number");--> statement-breakpoint
CREATE INDEX "login_event_email_idx" ON "login_event" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_event_merchant_idx" ON "login_event" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_merchant_user_uq" ON "membership" USING btree ("merchant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_client_req_uq" ON "message" USING btree ("conversation_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_external_uq" ON "message" USING btree ("conversation_id","external_message_id");--> statement-breakpoint
CREATE INDEX "message_conversation_sent_idx" ON "message" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "message_text_trgm_idx" ON "message" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notification_member_idx" ON "notification" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_dedupe_idx" ON "notification" USING btree ("membership_id","dedupe_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shop_ext_uq" ON "order" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE INDEX "order_buyer_idx" ON "order" USING btree ("shop_id","buyer_external_id");--> statement-breakpoint
CREATE INDEX "order_merchant_created_idx" ON "order" USING btree ("merchant_id","platform_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_app_merchant_platform_uq" ON "platform_app" USING btree ("merchant_id","platform");--> statement-breakpoint
CREATE INDEX "segment_conversation_idx" ON "segment" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "segment_merchant_started_idx" ON "segment" USING btree ("merchant_id","started_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_app_external_uq" ON "shop" USING btree ("platform_app_id","external_shop_id");--> statement-breakpoint
CREATE INDEX "shop_merchant_idx" ON "shop" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "shop_event_shop_idx" ON "shop_event" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_merchant_number_uq" ON "ticket" USING btree ("merchant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_open_dedupe_uq" ON "ticket" USING btree ("merchant_id","dedupe_key") WHERE status not in ('resolved','closed','void');--> statement-breakpoint
CREATE INDEX "ticket_merchant_status_idx" ON "ticket" USING btree ("merchant_id","status","due_at");--> statement-breakpoint
CREATE INDEX "ticket_assignee_idx" ON "ticket" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "ticket_event_ticket_idx" ON "ticket_event" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_period_merchant_start_uq" ON "usage_period" USING btree ("merchant_id","period_start");--> statement-breakpoint
CREATE INDEX "mock_after_sale_shop_idx" ON "mock_after_sale" USING btree ("platform","shop_id","update_time");--> statement-breakpoint
CREATE INDEX "mock_after_sale_order_idx" ON "mock_after_sale" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "mock_thread_shop_idx" ON "mock_buyer_thread" USING btree ("platform","shop_id");--> statement-breakpoint
CREATE INDEX "mock_message_conv_idx" ON "mock_message" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "mock_order_shop_idx" ON "mock_order" USING btree ("platform","shop_id","update_time");--> statement-breakpoint
CREATE INDEX "mock_push_log_created_idx" ON "mock_push_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mock_shop_app_idx" ON "mock_shop" USING btree ("platform","app_key");