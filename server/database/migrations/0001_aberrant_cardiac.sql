CREATE TABLE "therapist_job_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"offer_expires_at" timestamp with time zone NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "therapist_job_links_assignment_id_unique" UNIQUE("assignment_id"),
	CONSTRAINT "therapist_job_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "therapist_job_links" ADD CONSTRAINT "therapist_job_links_assignment_id_order_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."order_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_job_links" ADD CONSTRAINT "therapist_job_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_links_expiry_idx" ON "therapist_job_links" USING btree ("offer_expires_at");