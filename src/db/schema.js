import {
  pgTable, pgEnum, serial, integer, text, boolean, doublePrecision,
  numeric, timestamp, date, jsonb, index, uniqueIndex, foreignKey, primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ==================== HELPERS ====================

const ts        = (name) => timestamp(name, { precision: 3, mode: 'date' })
const money     = (name) => numeric(name, { precision: 10, scale: 2 })
const createdAt = () => ts('createdAt').notNull().defaultNow()
const updatedAt = () => ts('updatedAt').notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())

// Same FK naming / behaviour as the original Prisma migration
const fk = (table, column, foreignColumn, onDelete = 'restrict') =>
  foreignKey({
    name: `${table}_${column.name}_fkey`,
    columns: [column],
    foreignColumns: [foreignColumn],
  }).onDelete(onDelete).onUpdate('cascade')

// ==================== ENUMS ====================

export const userRole           = pgEnum('UserRole', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CAISSIER', 'STOCK_MANAGER'])
export const userStatus         = pgEnum('UserStatus', ['ACTIVE', 'INACTIVE', 'SUSPENDED'])
export const pharmacyStatus     = pgEnum('PharmacyStatus', ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'EXPIRED'])
export const subscriptionPlan   = pgEnum('SubscriptionPlan', ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'])
export const subscriptionStatus = pgEnum('SubscriptionStatus', ['ACTIVE', 'EXPIRED', 'CANCELLED', 'TRIAL'])
export const movementType       = pgEnum('MovementType', ['ENTRY', 'SALE', 'INVENTORY', 'ADJUSTMENT'])
export const batchStatus        = pgEnum('BatchStatus', ['ACTIVE', 'EXPIRED', 'DEPLETED', 'RECALLED'])
export const productStatus      = pgEnum('ProductStatus', ['AVAILABLE', 'OUT_OF_STOCK', 'DISCONTINUED', 'COMING_SOON'])
export const orderStatus        = pgEnum('OrderStatus', ['PENDING', 'READY', 'COMPLETED', 'CANCELLED'])
export const orderSource        = pgEnum('OrderSource', ['IN_STORE', 'ONLINE'])
export const receptionStatus    = pgEnum('ReceptionStatus', ['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'])
export const unitType           = pgEnum('UnitType', [
  'PIECE', 'BOX', 'BOTTLE', 'PACKET', 'TUBE', 'JAR', 'VIAL', 'AMPOULE', 'CAPSULE', 'TABLET',
  'ML', 'LITER', 'MG', 'G', 'KG', 'SPRAY', 'DROP', 'PATCH', 'INHALER', 'SUPPOSITORY', 'OTHER',
])

// ==================== SUPER ADMIN ====================

export const superAdmins = pgTable('super_admins', {
  id:         serial('id').primaryKey(),
  name:       text('name').notNull(),
  email:      text('email').notNull(),
  password:   text('password').notNull(),
  is_active:  boolean('is_active').notNull().default(true),
  last_login: ts('last_login'),
  createdAt:  createdAt(),
  updatedAt:  updatedAt(),
}, (t) => [
  uniqueIndex('super_admins_email_key').on(t.email),
])

export const superAdminLogs = pgTable('super_admin_logs', {
  id:           serial('id').primaryKey(),
  action:       text('action').notNull(),
  description:  text('description'),
  target_type:  text('target_type'), // pharmacy, subscription, user
  target_id:    integer('target_id'),
  ip_address:   text('ip_address'),
  createdAt:    createdAt(),
  superAdminId: integer('superAdminId').notNull(),
}, (t) => [
  index('super_admin_logs_superAdminId_idx').on(t.superAdminId),
  index('super_admin_logs_action_idx').on(t.action),
  index('super_admin_logs_createdAt_idx').on(t.createdAt),
  fk('super_admin_logs', t.superAdminId, superAdmins.id),
])

// ==================== PHARMACY ====================

export const pharmacy = pgTable('pharmacy', {
  id:               serial('id').primaryKey(),
  name:             text('name').notNull(),
  address:          text('address'),
  phone:            text('phone'),
  email:            text('email'),
  city:             text('city'),
  country:          text('country'),
  latitude:         doublePrecision('latitude'),
  longitude:        doublePrecision('longitude'),
  license_number:   text('license_number'),
  status:           pharmacyStatus('status').notNull().default('PENDING'),
  is_active:        boolean('is_active').notNull().default(false),
  suspended_at:     ts('suspended_at'),
  suspended_reason: text('suspended_reason'),
  max_users:        integer('max_users').notNull().default(5),
  duty_days:        integer('duty_days').array().notNull().default([]), // jours de garde : 0 = dimanche … 6 = samedi
  duty_start:       text('duty_start'), // début de garde 'HH:MM' — null = toute la journée
  duty_end:         text('duty_end'),   // fin de garde 'HH:MM' ; si < duty_start, la garde finit le lendemain
  logo_updated_at:  ts('logo_updated_at'), // null = pas de logo ; sert aussi de version pour le cache (?v=)
  createdAt:        createdAt(),
  updatedAt:        updatedAt(),
  deletedAt:        ts('deletedAt'),
}, (t) => [
  uniqueIndex('pharmacy_license_number_key').on(t.license_number),
  index('pharmacy_city_idx').on(t.city),
  index('pharmacy_status_idx').on(t.status),
  index('pharmacy_is_active_idx').on(t.is_active),
  index('pharmacy_name_idx').on(t.name),
])

// ==================== SUBSCRIPTION ====================

// Logo kept out of the pharmacy row so it never bloats login / listing payloads
export const pharmacyLogos = pgTable('pharmacy_logos', {
  pharmacyId: integer('pharmacyId').primaryKey(),
  mime:       text('mime').notNull(),
  data:       text('data').notNull(), // base64
  updatedAt:  updatedAt(),
}, (t) => [
  fk('pharmacy_logos', t.pharmacyId, pharmacy.id, 'cascade'),
])

export const subscriptions = pgTable('subscriptions', {
  id:             serial('id').primaryKey(),
  plan:           subscriptionPlan('plan').notNull().default('FREE'),
  status:         subscriptionStatus('status').notNull().default('TRIAL'),
  start_date:     ts('start_date').notNull().defaultNow(),
  end_date:       ts('end_date').notNull(),
  trial_end_date: ts('trial_end_date'),
  amount:         money('amount').notNull().default('0'),
  currency:       text('currency').notNull().default('MRU'),
  auto_renew:     boolean('auto_renew').notNull().default(false),
  notes:          text('notes'),
  createdAt:      createdAt(),
  updatedAt:      updatedAt(),
  pharmacyId:     integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('subscriptions_pharmacyId_key').on(t.pharmacyId),
  index('subscriptions_status_idx').on(t.status),
  index('subscriptions_end_date_idx').on(t.end_date),
  index('subscriptions_plan_idx').on(t.plan),
  fk('subscriptions', t.pharmacyId, pharmacy.id),
])

export const subscriptionPayments = pgTable('subscription_payments', {
  id:             serial('id').primaryKey(),
  amount:         money('amount').notNull(),
  currency:       text('currency').notNull().default('MRU'),
  method:         text('method').notNull(), // CASH, CARD, TRANSFER, MOBILE_MONEY
  reference:      text('reference'),
  paid_at:        ts('paid_at').notNull().defaultNow(),
  period_start:   ts('period_start').notNull(),
  period_end:     ts('period_end').notNull(),
  notes:          text('notes'),
  createdAt:      createdAt(),
  subscriptionId: integer('subscriptionId').notNull(),
}, (t) => [
  uniqueIndex('subscription_payments_reference_key').on(t.reference),
  index('subscription_payments_subscriptionId_idx').on(t.subscriptionId),
  index('subscription_payments_paid_at_idx').on(t.paid_at),
  fk('subscription_payments', t.subscriptionId, subscriptions.id),
])

// ==================== USERS ====================

export const users = pgTable('users', {
  id:         serial('id').primaryKey(),
  name:       text('name').notNull(),
  email:      text('email').notNull(),
  password:   text('password').notNull(),
  role:       userRole('role').notNull().default('CAISSIER'),
  status:     userStatus('status').notNull().default('ACTIVE'),
  last_login: ts('last_login'),
  phone:      text('phone'),
  address:    text('address'),
  createdAt:  createdAt(),
  updatedAt:  updatedAt(),
  deletedAt:  ts('deletedAt'),
  pharmacyId: integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('users_email_pharmacyId_key').on(t.email, t.pharmacyId),
  index('users_email_idx').on(t.email),
  index('users_pharmacyId_status_idx').on(t.pharmacyId, t.status),
  index('users_role_idx').on(t.role),
  fk('users', t.pharmacyId, pharmacy.id),
])

// ==================== PRODUCTS ====================

export const category = pgTable('category', {
  id:          serial('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  createdAt:   createdAt(),
  updatedAt:   updatedAt(),
  deletedAt:   ts('deletedAt'),
}, (t) => [
  uniqueIndex('category_name_key').on(t.name),
  index('category_name_idx').on(t.name),
])

export const products = pgTable('products', {
  id:               serial('id').primaryKey(),
  name:             text('name').notNull(),
  description:      text('description'),
  stock:            doublePrecision('stock').notNull().default(0),
  sale_price:       money('sale_price').notNull(),
  purchase_price:   money('purchase_price').notNull(),
  threshold:        doublePrecision('threshold').notNull().default(10),
  prescription_req: boolean('prescription_req').notNull().default(false),
  barcode:          text('barcode').notNull(),
  status:           productStatus('status').notNull().default('AVAILABLE'),
  unit_type:        unitType('unit_type').notNull().default('PIECE'),
  unit_name:        text('unit_name'),
  unit_quantity:    doublePrecision('unit_quantity'),
  subunit_type:     unitType('subunit_type'),
  subunit_name:     text('subunit_name'),
  is_divisible:     boolean('is_divisible').notNull().default(false),
  image_updated_at: ts('image_updated_at'), // null = pas d'image ; sert aussi de version pour le cache (?v=)
  createdAt:        createdAt(),
  updatedAt:        updatedAt(),
  deletedAt:        ts('deletedAt'),
  userId:           integer('userId'),
  categoryId:       integer('categoryId').notNull(),
  pharmacyId:       integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('products_barcode_pharmacyId_key').on(t.barcode, t.pharmacyId),
  index('products_name_idx').on(t.name),
  index('products_categoryId_idx').on(t.categoryId),
  index('products_pharmacyId_idx').on(t.pharmacyId),
  index('products_barcode_idx').on(t.barcode),
  index('products_stock_idx').on(t.stock),
  index('products_status_idx').on(t.status),
  fk('products', t.userId, users.id, 'set null'),
  fk('products', t.categoryId, category.id),
  fk('products', t.pharmacyId, pharmacy.id),
])

// Image kept out of the products row so listings stay light (same pattern as pharmacy_logos)
export const productImages = pgTable('product_images', {
  productId: integer('productId').primaryKey(),
  mime:      text('mime').notNull(),
  data:      text('data').notNull(), // base64
  updatedAt: updatedAt(),
}, (t) => [
  fk('product_images', t.productId, products.id, 'cascade'),
])

export const batches = pgTable('batches', {
  id:                 serial('id').primaryKey(),
  number:             text('number').notNull(),
  quantity:           doublePrecision('quantity').notNull().default(0),
  initial_quantity:   doublePrecision('initial_quantity').notNull(),
  expiration_date:    ts('expiration_date').notNull(),
  manufacturing_date: ts('manufacturing_date'),
  status:             batchStatus('status').notNull().default('ACTIVE'),
  unit_type:          unitType('unit_type'),
  unit_quantity:      doublePrecision('unit_quantity'),
  createdAt:          createdAt(),
  updatedAt:          updatedAt(),
  deletedAt:          ts('deletedAt'),
  productId:          integer('productId').notNull(),
  pharmacyId:         integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('batches_number_pharmacyId_key').on(t.number, t.pharmacyId),
  index('batches_pharmacyId_idx').on(t.pharmacyId),
  index('batches_expiration_date_idx').on(t.expiration_date),
  index('batches_status_idx').on(t.status),
  fk('batches', t.productId, products.id),
  fk('batches', t.pharmacyId, pharmacy.id),
])

// ==================== SALES ====================

export const sales = pgTable('sales', {
  id:             serial('id').primaryKey(),
  sale_date:      ts('sale_date').notNull().defaultNow(),
  invoice_number: text('invoice_number'),
  customer:       text('customer'),
  customer_phone: text('customer_phone'),
  customer_email: text('customer_email'),
  total_amount:   money('total_amount'),
  discount:       money('discount').default('0'),
  tax:            money('tax').default('0'),
  payment_method: text('payment_method'),
  createdAt:      createdAt(),
  updatedAt:      updatedAt(),
  deletedAt:      ts('deletedAt'),
  userId:         integer('userId'),
  pharmacyId:     integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('sales_invoice_number_key').on(t.invoice_number),
  index('sales_sale_date_idx').on(t.sale_date),
  index('sales_pharmacyId_idx').on(t.pharmacyId),
  fk('sales', t.userId, users.id, 'set null'),
  fk('sales', t.pharmacyId, pharmacy.id),
])

export const saleDetails = pgTable('saleDetails', {
  id:            serial('id').primaryKey(),
  quantity:      doublePrecision('quantity').notNull(),
  price:         money('price').notNull(),
  discount:      money('discount').default('0'),
  total:         money('total'),
  unit_type:     unitType('unit_type'),
  unit_name:     text('unit_name'),
  unit_quantity: doublePrecision('unit_quantity'),
  createdAt:     createdAt(),
  updatedAt:     updatedAt(),
  saleId:        integer('saleId').notNull(),
  productId:     integer('productId').notNull(),
  batchId:       integer('batchId'),
}, (t) => [
  index('saleDetails_saleId_idx').on(t.saleId),
  index('saleDetails_productId_idx').on(t.productId),
  fk('saleDetails', t.productId, products.id),
  fk('saleDetails', t.saleId, sales.id, 'cascade'),
  fk('saleDetails', t.batchId, batches.id, 'set null'),
])

// ==================== ORDERS ====================

export const orders = pgTable('orders', {
  id:                serial('id').primaryKey(),
  order_date:        ts('order_date').notNull().defaultNow(),
  delivery_date:     ts('delivery_date'),
  // Infos client
  customer:          text('customer').notNull(),
  customer_phone:    text('customer_phone'),
  customer_email:    text('customer_email'),
  customer_note:     text('customer_note'),
  // Source de la commande
  source:            orderSource('source').notNull().default('IN_STORE'),
  // Code de retrait unique (généré pour commandes ONLINE)
  pickup_code:       text('pickup_code'),
  pickup_expires_at: ts('pickup_expires_at'),
  pickup_code_used:  boolean('pickup_code_used').notNull().default(false),
  // Validation
  validated_by:      integer('validated_by'),
  validated_at:      ts('validated_at'),
  validated_note:    text('validated_note'),
  status:            orderStatus('status').notNull().default('PENDING'),
  total_amount:      money('total_amount'),
  createdAt:         createdAt(),
  updatedAt:         updatedAt(),
  deletedAt:         ts('deletedAt'),
  userId:            integer('userId'),
  pharmacyId:        integer('pharmacyId').notNull(),
}, (t) => [
  uniqueIndex('orders_pickup_code_key').on(t.pickup_code),
  index('orders_pharmacyId_idx').on(t.pharmacyId),
  index('orders_status_idx').on(t.status),
  index('orders_pickup_code_idx').on(t.pickup_code),
  index('orders_source_idx').on(t.source),
  fk('orders', t.userId, users.id, 'set null'),
  fk('orders', t.pharmacyId, pharmacy.id),
])

export const orderDetails = pgTable('orderDetails', {
  id:        serial('id').primaryKey(),
  quantity:  doublePrecision('quantity').notNull(),
  price:     money('price').notNull(),
  total:     money('total'),
  unit_type: unitType('unit_type'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  productId: integer('productId').notNull(),
  orderId:   integer('orderId').notNull(),
}, (t) => [
  index('orderDetails_orderId_idx').on(t.orderId),
  fk('orderDetails', t.orderId, orders.id, 'cascade'),
  fk('orderDetails', t.productId, products.id),
])

// ==================== RECEPTIONS ====================

export const receptions = pgTable('receptions', {
  id:             serial('id').primaryKey(),
  reception_date: ts('reception_date').notNull().defaultNow(),
  supplier:       text('supplier').notNull(),
  invoice_number: text('invoice_number'),
  status:         receptionStatus('status').notNull().default('PENDING'),
  total_amount:   money('total_amount'),
  createdAt:      createdAt(),
  updatedAt:      updatedAt(),
  deletedAt:      ts('deletedAt'),
  userId:         integer('userId'),
  pharmacyId:     integer('pharmacyId').notNull(),
}, (t) => [
  index('receptions_pharmacyId_idx').on(t.pharmacyId),
  fk('receptions', t.userId, users.id, 'set null'),
  fk('receptions', t.pharmacyId, pharmacy.id),
])

export const receptionDetails = pgTable('receptionDetails', {
  id:            serial('id').primaryKey(),
  quantity:      doublePrecision('quantity').notNull(),
  price:         money('price').notNull(),
  total:         money('total'),
  unit_type:     unitType('unit_type'),
  unit_quantity: doublePrecision('unit_quantity'),
  createdAt:     createdAt(),
  updatedAt:     updatedAt(),
  productId:     integer('productId').notNull(),
  receptionId:   integer('receptionId').notNull(),
  batchId:       integer('batchId'),
}, (t) => [
  index('receptionDetails_receptionId_idx').on(t.receptionId),
  fk('receptionDetails', t.productId, products.id),
  fk('receptionDetails', t.receptionId, receptions.id, 'cascade'),
  fk('receptionDetails', t.batchId, batches.id, 'set null'),
])

// ==================== STOCK ====================

export const inventories = pgTable('inventories', {
  id:             serial('id').primaryKey(),
  inventory_date: ts('inventory_date').notNull().defaultNow(),
  stock:          doublePrecision('stock').notNull(),
  expected_stock: doublePrecision('expected_stock'),
  difference:     doublePrecision('difference'),
  notes:          text('notes'),
  createdAt:      createdAt(),
  updatedAt:      updatedAt(),
  deletedAt:      ts('deletedAt'),
  productId:      integer('productId').notNull(),
  userId:         integer('userId'),
  pharmacyId:     integer('pharmacyId').notNull(),
}, (t) => [
  index('inventories_pharmacyId_idx').on(t.pharmacyId),
  fk('inventories', t.productId, products.id),
  fk('inventories', t.userId, users.id, 'set null'),
  fk('inventories', t.pharmacyId, pharmacy.id),
])

export const stockMovements = pgTable('stockMovements', {
  id:             serial('id').primaryKey(),
  quantity:       doublePrecision('quantity').notNull(),
  movement_date:  ts('movement_date').notNull().defaultNow(),
  type:           movementType('type').notNull(),
  reference_id:   integer('reference_id'),
  reason:         text('reason'),
  previous_stock: doublePrecision('previous_stock'),
  new_stock:      doublePrecision('new_stock'),
  unit_type:      unitType('unit_type'),
  unit_quantity:  doublePrecision('unit_quantity'),
  createdAt:      createdAt(),
  updatedAt:      updatedAt(),
  productId:      integer('productId').notNull(),
  userId:         integer('userId'),
  batchId:        integer('batchId'),
  pharmacyId:     integer('pharmacyId').notNull(),
}, (t) => [
  index('stockMovements_pharmacyId_idx').on(t.pharmacyId),
  index('stockMovements_type_idx').on(t.type),
  index('stockMovements_movement_date_idx').on(t.movement_date),
  fk('stockMovements', t.productId, products.id, 'cascade'),
  fk('stockMovements', t.userId, users.id, 'set null'),
  fk('stockMovements', t.batchId, batches.id, 'set null'),
  fk('stockMovements', t.pharmacyId, pharmacy.id),
])

export const unitConversions = pgTable('unitConversions', {
  id:                serial('id').primaryKey(),
  from_unit:         unitType('from_unit').notNull(),
  to_unit:           unitType('to_unit').notNull(),
  conversion_factor: doublePrecision('conversion_factor').notNull(),
  productId:         integer('productId'),
  createdAt:         createdAt(),
  updatedAt:         updatedAt(),
}, (t) => [
  uniqueIndex('unitConversions_from_unit_to_unit_productId_key').on(t.from_unit, t.to_unit, t.productId),
  fk('unitConversions', t.productId, products.id, 'set null'),
])

// ==================== MISC ====================

export const auditLogs = pgTable('auditLogs', {
  id:         serial('id').primaryKey(),
  action:     text('action').notNull(),
  entity:     text('entity').notNull(),
  entity_id:  integer('entity_id').notNull(),
  old_values: jsonb('old_values'),
  new_values: jsonb('new_values'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  createdAt:  createdAt(),
  userId:     integer('userId'),
  pharmacyId: integer('pharmacyId'),
}, (t) => [
  index('auditLogs_pharmacyId_idx').on(t.pharmacyId),
  index('auditLogs_createdAt_idx').on(t.createdAt),
  fk('auditLogs', t.userId, users.id, 'set null'),
  fk('auditLogs', t.pharmacyId, pharmacy.id, 'set null'),
])

export const notifications = pgTable('notifications', {
  id:         serial('id').primaryKey(),
  title:      text('title').notNull(),
  message:    text('message').notNull(),
  type:       text('type').notNull(),
  is_read:    boolean('is_read').notNull().default(false),
  createdAt:  createdAt(),
  updatedAt:  updatedAt(),
  userId:     integer('userId'),
  pharmacyId: integer('pharmacyId'),
}, (t) => [
  index('notifications_userId_idx').on(t.userId),
  index('notifications_pharmacyId_idx').on(t.pharmacyId),
  fk('notifications', t.userId, users.id, 'set null'),
  fk('notifications', t.pharmacyId, pharmacy.id, 'set null'),
])

// Platform notifications for the SuperAdmin panel (shared by all super admins)
export const superAdminNotifications = pgTable('super_admin_notifications', {
  id:         serial('id').primaryKey(),
  title:      text('title').notNull(),
  message:    text('message').notNull(),
  type:       text('type').notNull().default('INFO'), // INFO | SUCCESS | WARNING | ERROR
  link:       text('link'),                           // front route opened on click, e.g. /super/pharmacies
  is_read:    boolean('is_read').notNull().default(false),
  createdAt:  createdAt(),
  pharmacyId: integer('pharmacyId'),
}, (t) => [
  index('super_admin_notifications_is_read_idx').on(t.is_read),
  index('super_admin_notifications_createdAt_idx').on(t.createdAt),
  fk('super_admin_notifications', t.pharmacyId, pharmacy.id, 'cascade'),
])

// Public site visitors: one row per browser per day (UTC). visitorId is a random id kept in the
// visitor's browser — no IP or personal data is stored.
export const siteVisits = pgTable('site_visits', {
  day:       date('day', { mode: 'string' }).notNull(),
  visitorId: text('visitorId').notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ name: 'site_visits_pkey', columns: [t.day, t.visitorId] }),
])

export const settings = pgTable('settings', {
  id:          serial('id').primaryKey(),
  key:         text('key').notNull(),
  value:       jsonb('value').notNull(),
  description: text('description'),
  createdAt:   createdAt(),
  updatedAt:   updatedAt(),
  pharmacyId:  integer('pharmacyId'),
}, (t) => [
  uniqueIndex('settings_key_pharmacyId_key').on(t.key, t.pharmacyId),
  index('settings_pharmacyId_idx').on(t.pharmacyId),
  fk('settings', t.pharmacyId, pharmacy.id, 'set null'),
])

// ==================== RELATIONS ====================

export const superAdminsRelations = relations(superAdmins, ({ many }) => ({
  activityLogs: many(superAdminLogs),
}))

export const superAdminLogsRelations = relations(superAdminLogs, ({ one }) => ({
  superAdmin: one(superAdmins, { fields: [superAdminLogs.superAdminId], references: [superAdmins.id] }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  pharmacy: one(pharmacy, { fields: [subscriptions.pharmacyId], references: [pharmacy.id] }),
  payments: many(subscriptionPayments),
}))

export const subscriptionPaymentsRelations = relations(subscriptionPayments, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionPayments.subscriptionId], references: [subscriptions.id] }),
}))

export const pharmacyRelations = relations(pharmacy, ({ one, many }) => ({
  users:         many(users),
  products:      many(products),
  sales:         many(sales),
  receptions:    many(receptions),
  mouvements:    many(stockMovements),
  batches:       many(batches),
  orders:        many(orders),
  inventories:   many(inventories),
  auditLogs:     many(auditLogs),
  notifications: many(notifications),
  settings:      many(settings),
  subscription:  one(subscriptions),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  pharmacy:       one(pharmacy, { fields: [users.pharmacyId], references: [pharmacy.id] }),
  orders:         many(orders, { relationName: 'orderCreator' }),
  validatedOrders: many(orders, { relationName: 'orderValidator' }),
  receptions:     many(receptions),
  sales:          many(sales),
  products:       many(products),
  inventories:    many(inventories),
  stockMovements: many(stockMovements),
  auditLogs:      many(auditLogs),
  notifications:  many(notifications),
}))

export const categoryRelations = relations(category, ({ many }) => ({
  produit: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  user:             one(users, { fields: [products.userId], references: [users.id] }),
  category:         one(category, { fields: [products.categoryId], references: [category.id] }),
  pharmacy:         one(pharmacy, { fields: [products.pharmacyId], references: [pharmacy.id] }),
  batches:          many(batches),
  inventories:      many(inventories),
  orderDetails:     many(orderDetails),
  receptionDetails: many(receptionDetails),
  saleDetails:      many(saleDetails),
  stockMovements:   many(stockMovements),
  unitConversions:  many(unitConversions),
}))

export const batchesRelations = relations(batches, ({ one, many }) => ({
  product:          one(products, { fields: [batches.productId], references: [products.id] }),
  pharmacy:         one(pharmacy, { fields: [batches.pharmacyId], references: [pharmacy.id] }),
  saleDetails:      many(saleDetails),
  receptionDetails: many(receptionDetails),
  stockMovements:   many(stockMovements),
}))

export const salesRelations = relations(sales, ({ one, many }) => ({
  user:     one(users, { fields: [sales.userId], references: [users.id] }),
  pharmacy: one(pharmacy, { fields: [sales.pharmacyId], references: [pharmacy.id] }),
  details:  many(saleDetails),
}))

export const saleDetailsRelations = relations(saleDetails, ({ one }) => ({
  product: one(products, { fields: [saleDetails.productId], references: [products.id] }),
  sale:    one(sales, { fields: [saleDetails.saleId], references: [sales.id] }),
  batch:   one(batches, { fields: [saleDetails.batchId], references: [batches.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user:      one(users, { fields: [orders.userId], references: [users.id], relationName: 'orderCreator' }),
  validator: one(users, { fields: [orders.validated_by], references: [users.id], relationName: 'orderValidator' }),
  pharmacy: one(pharmacy, { fields: [orders.pharmacyId], references: [pharmacy.id] }),
  details:  many(orderDetails),
}))

export const orderDetailsRelations = relations(orderDetails, ({ one }) => ({
  order:   one(orders, { fields: [orderDetails.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderDetails.productId], references: [products.id] }),
}))

export const receptionsRelations = relations(receptions, ({ one, many }) => ({
  user:     one(users, { fields: [receptions.userId], references: [users.id] }),
  pharmacy: one(pharmacy, { fields: [receptions.pharmacyId], references: [pharmacy.id] }),
  details:  many(receptionDetails),
}))

export const receptionDetailsRelations = relations(receptionDetails, ({ one }) => ({
  product:   one(products, { fields: [receptionDetails.productId], references: [products.id] }),
  reception: one(receptions, { fields: [receptionDetails.receptionId], references: [receptions.id] }),
  batch:     one(batches, { fields: [receptionDetails.batchId], references: [batches.id] }),
}))

export const inventoriesRelations = relations(inventories, ({ one }) => ({
  product:  one(products, { fields: [inventories.productId], references: [products.id] }),
  user:     one(users, { fields: [inventories.userId], references: [users.id] }),
  pharmacy: one(pharmacy, { fields: [inventories.pharmacyId], references: [pharmacy.id] }),
}))

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product:  one(products, { fields: [stockMovements.productId], references: [products.id] }),
  user:     one(users, { fields: [stockMovements.userId], references: [users.id] }),
  batch:    one(batches, { fields: [stockMovements.batchId], references: [batches.id] }),
  pharmacy: one(pharmacy, { fields: [stockMovements.pharmacyId], references: [pharmacy.id] }),
}))

export const unitConversionsRelations = relations(unitConversions, ({ one }) => ({
  product: one(products, { fields: [unitConversions.productId], references: [products.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user:     one(users, { fields: [auditLogs.userId], references: [users.id] }),
  pharmacy: one(pharmacy, { fields: [auditLogs.pharmacyId], references: [pharmacy.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user:     one(users, { fields: [notifications.userId], references: [users.id] }),
  pharmacy: one(pharmacy, { fields: [notifications.pharmacyId], references: [pharmacy.id] }),
}))

export const settingsRelations = relations(settings, ({ one }) => ({
  pharmacy: one(pharmacy, { fields: [settings.pharmacyId], references: [pharmacy.id] }),
}))
