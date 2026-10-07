CREATE TABLE "product_images" (
	"productId" integer PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_updated_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;