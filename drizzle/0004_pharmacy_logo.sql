CREATE TABLE "pharmacy_logos" (
	"pharmacyId" integer PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pharmacy" ADD COLUMN "logo_updated_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "pharmacy_logos" ADD CONSTRAINT "pharmacy_logos_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE cascade ON UPDATE cascade;