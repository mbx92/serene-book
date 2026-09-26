CREATE TABLE "public_booking_limits" (
  "bucket_key" text PRIMARY KEY NOT NULL,
  "hit_count" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "public_booking_limits_positive_count" CHECK (hit_count > 0)
);
--> statement-breakpoint
CREATE INDEX "public_booking_limits_expiry_idx" ON "public_booking_limits" ("expires_at");
