CREATE TABLE "order_revenue_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"location_id" integer,
	"therapist_id" integer,
	"owner_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"admin_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"therapist_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"trigger" text NOT NULL,
	"service_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"collected_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"allocated_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"owner_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"admin_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"therapist_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_revenue_shares_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "revenue_share_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"share_id" integer NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"base_delta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"owner_delta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"admin_delta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"therapist_delta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_share_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "revenue_sharing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"owner_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"admin_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"therapist_percent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"trigger" text DEFAULT 'PAYMENT_RECEIVED' NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_revenue_shares" ADD CONSTRAINT "order_revenue_shares_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revenue_shares" ADD CONSTRAINT "order_revenue_shares_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revenue_shares" ADD CONSTRAINT "order_revenue_shares_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_share_events" ADD CONSTRAINT "revenue_share_events_share_id_order_revenue_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."order_revenue_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_share_events" ADD CONSTRAINT "revenue_share_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_sharing_settings" ADD CONSTRAINT "revenue_sharing_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE revenue_sharing_settings ADD CONSTRAINT revenue_settings_valid CHECK (id = 1 AND owner_percent BETWEEN 0 AND 100 AND admin_percent BETWEEN 0 AND 100 AND therapist_percent BETWEEN 0 AND 100 AND owner_percent + admin_percent + therapist_percent = 100 AND trigger IN ('PAYMENT_RECEIVED', 'ORDER_COMPLETED'));
--> statement-breakpoint
ALTER TABLE order_revenue_shares ADD CONSTRAINT revenue_share_valid CHECK (owner_percent BETWEEN 0 AND 100 AND admin_percent BETWEEN 0 AND 100 AND therapist_percent BETWEEN 0 AND 100 AND owner_percent + admin_percent + therapist_percent = 100 AND trigger IN ('PAYMENT_RECEIVED', 'ORDER_COMPLETED') AND service_base >= 0 AND collected_base >= 0 AND allocated_base >= 0 AND allocated_base <= service_base AND owner_amount >= 0 AND admin_amount >= 0 AND therapist_amount >= 0 AND owner_amount + admin_amount + therapist_amount = allocated_base);
--> statement-breakpoint
INSERT INTO revenue_sharing_settings (id, owner_percent, admin_percent, therapist_percent) VALUES (1, 10, 10, 80);
