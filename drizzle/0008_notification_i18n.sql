ALTER TABLE "notifications" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "super_admin_notifications" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "super_admin_notifications" ADD COLUMN "params" jsonb;