CREATE TYPE "public"."BatchStatus" AS ENUM('ACTIVE', 'EXPIRED', 'DEPLETED', 'RECALLED');--> statement-breakpoint
CREATE TYPE "public"."MovementType" AS ENUM('ENTRY', 'SALE', 'INVENTORY', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."OrderSource" AS ENUM('IN_STORE', 'ONLINE');--> statement-breakpoint
CREATE TYPE "public"."OrderStatus" AS ENUM('PENDING', 'READY', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PharmacyStatus" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."ProductStatus" AS ENUM('AVAILABLE', 'OUT_OF_STOCK', 'DISCONTINUED', 'COMING_SOON');--> statement-breakpoint
CREATE TYPE "public"."ReceptionStatus" AS ENUM('PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionPlan" AS ENUM('FREE', 'STARTER', 'PRO', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'TRIAL');--> statement-breakpoint
CREATE TYPE "public"."UnitType" AS ENUM('PIECE', 'BOX', 'BOTTLE', 'PACKET', 'TUBE', 'JAR', 'VIAL', 'AMPOULE', 'CAPSULE', 'TABLET', 'ML', 'LITER', 'MG', 'G', 'KG', 'SPRAY', 'DROP', 'PATCH', 'INHALER', 'SUPPOSITORY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CAISSIER', 'STOCK_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" text,
	"user_agent" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"userId" integer,
	"pharmacyId" integer
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"initial_quantity" double precision NOT NULL,
	"expiration_date" timestamp (3) NOT NULL,
	"manufacturing_date" timestamp (3),
	"status" "BatchStatus" DEFAULT 'ACTIVE' NOT NULL,
	"unit_type" "UnitType",
	"unit_quantity" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"productId" integer NOT NULL,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_date" timestamp (3) DEFAULT now() NOT NULL,
	"stock" double precision NOT NULL,
	"expected_stock" double precision,
	"difference" double precision,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"productId" integer NOT NULL,
	"userId" integer,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"userId" integer,
	"pharmacyId" integer
);
--> statement-breakpoint
CREATE TABLE "orderDetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"quantity" double precision NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2),
	"unit_type" "UnitType",
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"productId" integer NOT NULL,
	"orderId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_date" timestamp (3) DEFAULT now() NOT NULL,
	"delivery_date" timestamp (3),
	"customer" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"customer_note" text,
	"source" "OrderSource" DEFAULT 'IN_STORE' NOT NULL,
	"pickup_code" text,
	"pickup_expires_at" timestamp (3),
	"pickup_code_used" boolean DEFAULT false NOT NULL,
	"validated_by" integer,
	"validated_at" timestamp (3),
	"validated_note" text,
	"status" "OrderStatus" DEFAULT 'PENDING' NOT NULL,
	"total_amount" numeric(10, 2),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"userId" integer,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"city" text,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"license_number" text,
	"status" "PharmacyStatus" DEFAULT 'PENDING' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp (3),
	"suspended_reason" text,
	"max_users" integer DEFAULT 5 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stock" double precision DEFAULT 0 NOT NULL,
	"sale_price" numeric(10, 2) NOT NULL,
	"purchase_price" numeric(10, 2) NOT NULL,
	"threshold" double precision DEFAULT 10 NOT NULL,
	"prescription_req" boolean DEFAULT false NOT NULL,
	"barcode" text NOT NULL,
	"status" "ProductStatus" DEFAULT 'AVAILABLE' NOT NULL,
	"unit_type" "UnitType" DEFAULT 'PIECE' NOT NULL,
	"unit_name" text,
	"unit_quantity" double precision,
	"subunit_type" "UnitType",
	"subunit_name" text,
	"is_divisible" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"userId" integer,
	"categoryId" integer NOT NULL,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receptionDetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"quantity" double precision NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2),
	"unit_type" "UnitType",
	"unit_quantity" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"productId" integer NOT NULL,
	"receptionId" integer NOT NULL,
	"batchId" integer
);
--> statement-breakpoint
CREATE TABLE "receptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_date" timestamp (3) DEFAULT now() NOT NULL,
	"supplier" text NOT NULL,
	"invoice_number" text,
	"status" "ReceptionStatus" DEFAULT 'PENDING' NOT NULL,
	"total_amount" numeric(10, 2),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"userId" integer,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saleDetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"quantity" double precision NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2),
	"unit_type" "UnitType",
	"unit_name" text,
	"unit_quantity" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"saleId" integer NOT NULL,
	"productId" integer NOT NULL,
	"batchId" integer
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_date" timestamp (3) DEFAULT now() NOT NULL,
	"invoice_number" text,
	"customer" text,
	"customer_phone" text,
	"customer_email" text,
	"total_amount" numeric(10, 2),
	"discount" numeric(10, 2) DEFAULT '0',
	"tax" numeric(10, 2) DEFAULT '0',
	"payment_method" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"userId" integer,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"pharmacyId" integer
);
--> statement-breakpoint
CREATE TABLE "stockMovements" (
	"id" serial PRIMARY KEY NOT NULL,
	"quantity" double precision NOT NULL,
	"movement_date" timestamp (3) DEFAULT now() NOT NULL,
	"type" "MovementType" NOT NULL,
	"reference_id" integer,
	"reason" text,
	"previous_stock" double precision,
	"new_stock" double precision,
	"unit_type" "UnitType",
	"unit_quantity" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"productId" integer NOT NULL,
	"userId" integer,
	"batchId" integer,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_at" timestamp (3) DEFAULT now() NOT NULL,
	"period_start" timestamp (3) NOT NULL,
	"period_end" timestamp (3) NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"subscriptionId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan" "SubscriptionPlan" DEFAULT 'FREE' NOT NULL,
	"status" "SubscriptionStatus" DEFAULT 'TRIAL' NOT NULL,
	"start_date" timestamp (3) DEFAULT now() NOT NULL,
	"end_date" timestamp (3) NOT NULL,
	"trial_end_date" timestamp (3),
	"amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"target_type" text,
	"target_id" integer,
	"ip_address" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"superAdminId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unitConversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_unit" "UnitType" NOT NULL,
	"to_unit" "UnitType" NOT NULL,
	"conversion_factor" double precision NOT NULL,
	"productId" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "UserRole" DEFAULT 'CAISSIER' NOT NULL,
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"last_login" timestamp (3),
	"phone" text,
	"address" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3),
	"pharmacyId" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orderDetails" ADD CONSTRAINT "orderDetails_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orderDetails" ADD CONSTRAINT "orderDetails_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receptionDetails" ADD CONSTRAINT "receptionDetails_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receptionDetails" ADD CONSTRAINT "receptionDetails_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receptionDetails" ADD CONSTRAINT "receptionDetails_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saleDetails" ADD CONSTRAINT "saleDetails_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saleDetails" ADD CONSTRAINT "saleDetails_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saleDetails" ADD CONSTRAINT "saleDetails_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "super_admin_logs" ADD CONSTRAINT "super_admin_logs_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "public"."super_admins"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "unitConversions" ADD CONSTRAINT "unitConversions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "public"."pharmacy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "auditLogs_pharmacyId_idx" ON "auditLogs" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "auditLogs_createdAt_idx" ON "auditLogs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_number_pharmacyId_key" ON "batches" USING btree ("number","pharmacyId");--> statement-breakpoint
CREATE INDEX "batches_pharmacyId_idx" ON "batches" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "batches_expiration_date_idx" ON "batches" USING btree ("expiration_date");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "category_name_key" ON "category" USING btree ("name");--> statement-breakpoint
CREATE INDEX "category_name_idx" ON "category" USING btree ("name");--> statement-breakpoint
CREATE INDEX "inventories_pharmacyId_idx" ON "inventories" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "notifications_userId_idx" ON "notifications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notifications_pharmacyId_idx" ON "notifications" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "orderDetails_orderId_idx" ON "orderDetails" USING btree ("orderId");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_pickup_code_key" ON "orders" USING btree ("pickup_code");--> statement-breakpoint
CREATE INDEX "orders_pharmacyId_idx" ON "orders" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_pickup_code_idx" ON "orders" USING btree ("pickup_code");--> statement-breakpoint
CREATE INDEX "orders_source_idx" ON "orders" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_license_number_key" ON "pharmacy" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "pharmacy_city_idx" ON "pharmacy" USING btree ("city");--> statement-breakpoint
CREATE INDEX "pharmacy_status_idx" ON "pharmacy" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pharmacy_is_active_idx" ON "pharmacy" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "pharmacy_name_idx" ON "pharmacy" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_pharmacyId_key" ON "products" USING btree ("barcode","pharmacyId");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_categoryId_idx" ON "products" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "products_pharmacyId_idx" ON "products" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "products_barcode_idx" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "products_stock_idx" ON "products" USING btree ("stock");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receptionDetails_receptionId_idx" ON "receptionDetails" USING btree ("receptionId");--> statement-breakpoint
CREATE INDEX "receptions_pharmacyId_idx" ON "receptions" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "saleDetails_saleId_idx" ON "saleDetails" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "saleDetails_productId_idx" ON "saleDetails" USING btree ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "sales_sale_date_idx" ON "sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "sales_pharmacyId_idx" ON "sales" USING btree ("pharmacyId");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_pharmacyId_key" ON "settings" USING btree ("key","pharmacyId");--> statement-breakpoint
CREATE INDEX "settings_pharmacyId_idx" ON "settings" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "stockMovements_pharmacyId_idx" ON "stockMovements" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "stockMovements_type_idx" ON "stockMovements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stockMovements_movement_date_idx" ON "stockMovements" USING btree ("movement_date");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_reference_key" ON "subscription_payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscriptionId_idx" ON "subscription_payments" USING btree ("subscriptionId");--> statement-breakpoint
CREATE INDEX "subscription_payments_paid_at_idx" ON "subscription_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_pharmacyId_key" ON "subscriptions" USING btree ("pharmacyId");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_end_date_idx" ON "subscriptions" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "super_admin_logs_superAdminId_idx" ON "super_admin_logs" USING btree ("superAdminId");--> statement-breakpoint
CREATE INDEX "super_admin_logs_action_idx" ON "super_admin_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "super_admin_logs_createdAt_idx" ON "super_admin_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "unitConversions_from_unit_to_unit_productId_key" ON "unitConversions" USING btree ("from_unit","to_unit","productId");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_pharmacyId_key" ON "users" USING btree ("email","pharmacyId");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_pharmacyId_status_idx" ON "users" USING btree ("pharmacyId","status");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");