CREATE TABLE "app_branding" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"app_name" varchar(80) DEFAULT 'Serene Spa Management' NOT NULL,
	"logo" text,
	"favicon" text,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_branding" ADD CONSTRAINT "app_branding_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;