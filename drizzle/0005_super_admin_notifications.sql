CREATE TABLE "super_admin_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'INFO' NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"pharmacyId" integer
);
--> statement-breakpoint
ALTER TABLE "super_admin_notifications" ADD CONSTRAINT "super_admin_notifications_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "super_admin_notifications_is_read_idx" ON "super_admin_notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "super_admin_notifications_createdAt_idx" ON "super_admin_notifications" USING btree ("createdAt");