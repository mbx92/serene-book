CREATE TABLE "billing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"transport_enabled" boolean DEFAULT true NOT NULL,
	"tax_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE billing_settings ADD CONSTRAINT billing_settings_singleton CHECK (id = 1);
--> statement-breakpoint
INSERT INTO billing_settings (id, transport_enabled, tax_enabled) VALUES (1, true, true);
