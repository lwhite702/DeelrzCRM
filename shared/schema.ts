import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  pgEnum,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enums
export const userRoleEnum = pgEnum("user_role", ["super_admin", "owner", "manager", "staff"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "trial"]);
export const productTypeEnum = pgEnum("product_type", ["solid", "liquid", "other"]);
export const productUnitEnum = pgEnum("product_unit", ["g", "ml", "count"]);
export const adjustmentReasonEnum = pgEnum("adjustment_reason", ["waste", "sample", "personal", "recount"]);
export const fulfillmentMethodEnum = pgEnum("fulfillment_method", ["pickup", "delivery"]);
export const orderStatusEnum = pgEnum("order_status", ["draft", "confirmed", "paid", "voided"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);
export const deliveryMethodEnum = pgEnum("delivery_method", ["pickup", "manual_courier"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["requested", "picked_up", "delivered", "canceled"]);
export const loyaltyTierEnum = pgEnum("loyalty_tier", ["bronze", "silver", "gold", "platinum"]);
export const creditStatusEnum = pgEnum("credit_status", ["active", "suspended", "frozen"]);
export const creditTransactionStatusEnum = pgEnum("credit_transaction_status", ["pending", "paid", "overdue"]);
export const paymentModeEnum = pgEnum("payment_mode", ["platform", "connect_standard", "connect_express"]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "cash", "custom", "transfer", "ach"]);
export const kbCategoryEnum = pgEnum("kb_category", ["getting_started", "features", "troubleshooting", "billing", "api", "integrations", "other"]);
export const keyStatusEnum = pgEnum("key_status", ["active", "revoked"]);
export const selfDestructStatusEnum = pgEnum("self_destruct_status", ["armed", "disarmed", "destroyed"]);
export const purgeStatusEnum = pgEnum("purge_status", ["pending", "running", "finished", "failed", "canceled"]);
export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete", "arm_self_destruct", "disarm_self_destruct", "destroy_self_destruct", "sweeper_destroy", "request_purge", "ack_export", "schedule_purge", "cancel_purge", "start_purge", "complete_purge", "fail_purge"]);

// Tenants
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("trial"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tenants_status").on(table.status),
]);

// Tenant Keys for envelope encryption
export const tenantKeys = pgTable("tenant_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  keyVersion: integer("key_version").notNull().default(1),
  wrappedKey: varchar("wrapped_key", { length: 2048 }).notNull(), // Base64 encoded encrypted data key
  status: keyStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("idx_tenant_keys_tenant").on(table.tenantId),
  index("idx_tenant_keys_status").on(table.status),
  index("idx_tenant_keys_version").on(table.keyVersion),
]);

// Users-Tenants junction table
export const usersTenants = pgTable("users_tenants", {
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_users_tenants_user").on(table.userId),
  index("idx_users_tenants_tenant").on(table.tenantId),
]);

// Feature Flags
export const featureFlags = pgTable("feature_flags", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  description: text("description"),
  defaultEnabled: boolean("default_enabled").notNull().default(true),
});

export const featureFlagOverrides = pgTable("feature_flag_overrides", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  flagKey: varchar("flag_key", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_feature_overrides_tenant").on(table.tenantId),
  index("idx_feature_overrides_flag").on(table.flagKey),
]);

// Products
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  ndcCode: varchar("ndc_code", { length: 20 }),
  type: productTypeEnum("type").notNull().default("solid"),
  unit: productUnitEnum("unit").notNull().default("count"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_products_tenant").on(table.tenantId),
  index("idx_products_ndc").on(table.ndcCode),
]);

// Batches
export const batches = pgTable("batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  acquiredAt: timestamp("acquired_at").notNull(),
  supplier: varchar("supplier", { length: 255 }),
  qtyAcquired: integer("qty_acquired").notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_batches_tenant").on(table.tenantId),
  index("idx_batches_product").on(table.productId),
]);

// Inventory Lots
export const inventoryLots = pgTable("inventory_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  batchId: varchar("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
  qtyRemaining: integer("qty_remaining").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_inventory_lots_tenant").on(table.tenantId),
  index("idx_inventory_lots_product").on(table.productId),
  index("idx_inventory_lots_batch").on(table.batchId),
]);

// Adjustments
export const adjustments = pgTable("adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  qtyDelta: integer("qty_delta").notNull(),
  reason: adjustmentReasonEnum("reason").notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_adjustments_tenant").on(table.tenantId),
  index("idx_adjustments_product").on(table.productId),
]);

// Customers
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  preferredFulfillment: fulfillmentMethodEnum("preferred_fulfillment").default("pickup"),
  preferredPayment: varchar("preferred_payment", { length: 50 }),
  notes: text("notes"),
  // Encrypted fields for dual-write approach
  nameEnc: jsonb("name_enc"), // Encrypted name
  phoneEnc: jsonb("phone_enc"), // Encrypted phone
  emailEnc: jsonb("email_enc"), // Encrypted email
  notesEnc: jsonb("notes_enc"), // Encrypted notes
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_customers_tenant").on(table.tenantId),
  index("idx_customers_email").on(table.email),
  index("idx_customers_phone").on(table.phone),
]);

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id),
  status: orderStatusEnum("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentNotes: text("payment_notes"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  paymentIntentId: varchar("payment_intent_id"),
  chargeId: varchar("charge_id"),
  transferId: varchar("transfer_id"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_orders_tenant").on(table.tenantId),
  index("idx_orders_customer").on(table.customerId),
  index("idx_orders_status").on(table.status),
  index("idx_orders_created").on(table.createdAt),
]);

// Order Items
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  batchId: varchar("batch_id").references(() => batches.id),
  qty: integer("qty").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  unitCostSnapshot: decimal("unit_cost_snapshot", { precision: 10, scale: 2 }),
}, (table) => [
  index("idx_order_items_order").on(table.orderId),
  index("idx_order_items_product").on(table.productId),
]);

// Deliveries
export const deliveries = pgTable("deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: deliveryMethodEnum("method").notNull(),
  addressLine1: varchar("address_line1", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 50 }).default("US"),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lon: decimal("lon", { precision: 10, scale: 7 }),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull().default("0"),
  status: deliveryStatusEnum("status").notNull().default("requested"),
  // Encrypted fields for dual-write approach
  addressLine1Enc: jsonb("address_line1_enc"), // Encrypted address
  cityEnc: jsonb("city_enc"), // Encrypted city
  stateEnc: jsonb("state_enc"), // Encrypted state
  postalCodeEnc: jsonb("postal_code_enc"), // Encrypted postal code
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_deliveries_tenant").on(table.tenantId),
  index("idx_deliveries_order").on(table.orderId),
  index("idx_deliveries_status").on(table.status),
]);

// Loyalty Accounts
export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  tier: loyaltyTierEnum("tier").notNull().default("bronze"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_loyalty_tenant").on(table.tenantId),
  index("idx_loyalty_customer").on(table.customerId),
]);

// Loyalty Events
export const loyaltyEvents = pgTable("loyalty_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id),
  pointsDelta: integer("points_delta").notNull(),
  reason: varchar("reason", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_loyalty_events_tenant").on(table.tenantId),
  index("idx_loyalty_events_customer").on(table.customerId),
]);

// Credits
export const credits = pgTable("credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  limitAmount: decimal("limit_amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  status: creditStatusEnum("status").notNull().default("active"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_credits_tenant").on(table.tenantId),
  index("idx_credits_customer").on(table.customerId),
]);

// Credit Transactions
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  status: creditTransactionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_credit_transactions_tenant").on(table.tenantId),
  index("idx_credit_transactions_customer").on(table.customerId),
  index("idx_credit_transactions_due").on(table.dueDate),
]);

// Tenant Settings
export const settingsTenant = pgTable("settings_tenant", {
  tenantId: varchar("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  targetMargin: decimal("target_margin", { precision: 5, scale: 4 }).default("0.3000"),
  minStockThreshold: integer("min_stock_threshold").default(10),
  exposureCap: decimal("exposure_cap", { precision: 10, scale: 2 }).default("10000.00"),
  deliveryMethodsEnabled: text("delivery_methods_enabled").default("pickup,manual_courier"),
  leadTimeDays: integer("lead_time_days").default(7),
  safetyDays: integer("safety_days").default(3),
  cityProfile: jsonb("city_profile"),
  paymentMode: paymentModeEnum("payment_mode").default("platform"),
  applicationFeeBps: integer("application_fee_bps").default(0),
  defaultCurrency: varchar("default_currency", { length: 3 }).default("usd"),
  stripeAccountId: varchar("stripe_account_id"),
});

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id, { onDelete: "set null" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  method: paymentMethodEnum("method").notNull(),
  paymentIntentId: varchar("payment_intent_id"),
  chargeId: varchar("charge_id"),
  transferId: varchar("transfer_id"),
  refundId: varchar("refund_id"),
  failureReason: varchar("failure_reason"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  applicationFeeBps: integer("application_fee_bps").default(0),
  processingFeeCents: integer("processing_fee_cents").default(0),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payments_tenant").on(table.tenantId),
  index("idx_payments_order").on(table.orderId),
  index("idx_payments_customer").on(table.customerId),
  index("idx_payments_status").on(table.status),
  index("idx_payments_created").on(table.createdAt),
  index("idx_payments_intent").on(table.paymentIntentId),
]);

// Webhook Events (for idempotency tracking)
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().unique(), // Stripe event ID for idempotency
  eventType: varchar("event_type").notNull(),
  processed: boolean("processed").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_webhook_events_event_id").on(table.eventId),
  index("idx_webhook_events_type").on(table.eventType),
  index("idx_webhook_events_processed").on(table.processed),
]);

// Knowledge Base Articles
export const kbArticles = pgTable("kb_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // nullable for global articles
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  contentMd: text("content_md").notNull(),
  category: kbCategoryEnum("category").notNull(),
  tags: varchar("tags", { length: 100 }).array().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_kb_articles_tenant").on(table.tenantId),
  index("idx_kb_articles_slug").on(table.slug),
  index("idx_kb_articles_category").on(table.category),
  index("idx_kb_articles_active").on(table.isActive),
]);

// Knowledge Base Feedback
export const kbFeedback = pgTable("kb_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => kbArticles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  isHelpful: boolean("is_helpful").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_kb_feedback_article").on(table.articleId),
  index("idx_kb_feedback_user").on(table.userId),
  index("idx_kb_feedback_tenant").on(table.tenantId),
]);

// User Settings
export const userSettings = pgTable("user_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  hasCompletedTour: boolean("has_completed_tour").notNull().default(false),
  tourProgress: jsonb("tour_progress"),
  helpPreferences: jsonb("help_preferences"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Self-Destructible Content Management
export const selfDestructs = pgTable("self_destructs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  targetTable: varchar("target_table", { length: 100 }).notNull(),
  targetId: varchar("target_id").notNull(),
  status: selfDestructStatusEnum("status").notNull().default("armed"),
  armedAt: timestamp("armed_at").defaultNow(),
  destructAt: timestamp("destruct_at"), // TTL timestamp
  destroyedAt: timestamp("destroyed_at"),
  armedBy: varchar("armed_by").notNull().references(() => users.id),
  disarmedBy: varchar("disarmed_by").references(() => users.id),
  destroyedBy: varchar("destroyed_by").references(() => users.id),
  reason: text("reason"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("idx_self_destructs_tenant").on(table.tenantId),
  index("idx_self_destructs_target").on(table.targetTable, table.targetId),
  index("idx_self_destructs_status").on(table.status),
  index("idx_self_destructs_destruct_at").on(table.destructAt),
  index("idx_self_destructs_armed_at").on(table.armedAt),
  // Unique constraint for idempotency - prevent duplicate armed records
  unique("unique_armed_target").on(table.tenantId, table.targetTable, table.targetId, table.status),
]);

// Enhanced Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  targetTable: varchar("target_table", { length: 100 }).notNull(),
  targetId: varchar("target_id").notNull(),
  action: auditActionEnum("action").notNull(),
  actor: varchar("actor").references(() => users.id), // null for system/sweeper actions
  actorType: varchar("actor_type", { length: 20 }).default("user"), // user, system, sweeper
  changes: jsonb("changes"), // before/after values for updates
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_audit_logs_tenant").on(table.tenantId),
  index("idx_audit_logs_target").on(table.targetTable, table.targetId),
  index("idx_audit_logs_action").on(table.action),
  index("idx_audit_logs_actor").on(table.actor),
  index("idx_audit_logs_created").on(table.createdAt),
]);

// Danger Purge Operations - EXTREMELY SENSITIVE
export const purgeOperations = pgTable("purge_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  tenantName: varchar("tenant_name", { length: 255 }).notNull(), // Snapshot for confirmation
  status: purgeStatusEnum("status").notNull().default("pending"),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at").defaultNow(),
  exportAckedAt: timestamp("export_acked_at"),
  scheduledAt: timestamp("scheduled_at"), // When to execute
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  canceledAt: timestamp("canceled_at"),
  failedAt: timestamp("failed_at"),
  canceledBy: varchar("canceled_by").references(() => users.id),
  reason: text("reason").notNull(),
  confirmationToken: varchar("confirmation_token", { length: 64 }), // For OTP verification
  ipAddress: varchar("ip_address", { length: 45 }), // IPv4/IPv6
  userAgent: text("user_agent"),
  errorMessage: text("error_message"), // If failed
  recordsDestroyed: integer("records_destroyed").default(0),
  tablesDestroyed: integer("tables_destroyed").default(0),
  metadata: jsonb("metadata"), // Additional tracking data
}, (table) => [
  index("idx_purge_operations_tenant").on(table.tenantId),
  index("idx_purge_operations_status").on(table.status),
  index("idx_purge_operations_scheduled").on(table.scheduledAt),
  index("idx_purge_operations_requested").on(table.requestedBy),
  // CRITICAL: Prevent concurrent purges per tenant
  unique("unique_active_purge_per_tenant").on(table.tenantId, table.status),
]);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  usersTenants: many(usersTenants),
  ordersCreated: many(orders),
  adjustmentsCreated: many(adjustments),
  paymentsCreated: many(payments),
  kbArticlesCreated: many(kbArticles),
  kbFeedbackGiven: many(kbFeedback),
  settings: one(userSettings),
}));

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  usersTenants: many(usersTenants),
  products: many(products),
  customers: many(customers),
  orders: many(orders),
  payments: many(payments),
  settings: one(settingsTenant),
  featureFlagOverrides: many(featureFlagOverrides),
  kbArticles: many(kbArticles),
  kbFeedback: many(kbFeedback),
}));

export const usersTenantsRelations = relations(usersTenants, ({ one }) => ({
  user: one(users, {
    fields: [usersTenants.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [usersTenants.tenantId],
    references: [tenants.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  batches: many(batches),
  inventoryLots: many(inventoryLots),
  orderItems: many(orderItems),
  adjustments: many(adjustments),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [customers.tenantId],
    references: [tenants.id],
  }),
  orders: many(orders),
  payments: many(payments),
  loyaltyAccount: one(loyaltyAccounts),
  credit: one(credits),
  loyaltyEvents: many(loyaltyEvents),
  creditTransactions: many(creditTransactions),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [orders.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  orderItems: many(orderItems),
  payments: many(payments),
  delivery: one(deliveries),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [payments.createdBy],
    references: [users.id],
  }),
}));

export const kbArticlesRelations = relations(kbArticles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [kbArticles.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(users, {
    fields: [kbArticles.createdBy],
    references: [users.id],
  }),
  feedback: many(kbFeedback),
}));

export const kbFeedbackRelations = relations(kbFeedback, ({ one }) => ({
  article: one(kbArticles, {
    fields: [kbFeedback.articleId],
    references: [kbArticles.id],
  }),
  user: one(users, {
    fields: [kbFeedback.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [kbFeedback.tenantId],
    references: [tenants.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

// Type exports
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;
export type TenantKey = typeof tenantKeys.$inferSelect;
export type InsertTenantKey = typeof tenantKeys.$inferInsert;
export type UserTenant = typeof usersTenants.$inferSelect;
export type InsertUserTenant = typeof usersTenants.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type InsertBatch = typeof batches.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;
export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;
export type InsertFeatureFlagOverride = typeof featureFlagOverrides.$inferInsert;
export type LoyaltyAccount = typeof loyaltyAccounts.$inferSelect;
export type InsertLoyaltyAccount = typeof loyaltyAccounts.$inferInsert;
export type Credit = typeof credits.$inferSelect;
export type InsertCredit = typeof credits.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type TenantSettings = typeof settingsTenant.$inferSelect;
export type InsertTenantSettings = typeof settingsTenant.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type KbArticle = typeof kbArticles.$inferSelect;
export type InsertKbArticle = typeof kbArticles.$inferInsert;
export type KbFeedback = typeof kbFeedback.$inferSelect;
export type InsertKbFeedback = typeof kbFeedback.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;
export type SelfDestruct = typeof selfDestructs.$inferSelect;
export type InsertSelfDestruct = typeof selfDestructs.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type PurgeOperation = typeof purgeOperations.$inferSelect;
export type InsertPurgeOperation = typeof purgeOperations.$inferInsert;

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertCreditSchema = createInsertSchema(credits).omit({
  id: true,
  updatedAt: true,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSettingsSchema = createInsertSchema(settingsTenant).omit({
  tenantId: true, // Will be provided by route parameter
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
});

export const insertKbArticleSchema = createInsertSchema(kbArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKbFeedbackSchema = createInsertSchema(kbFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  updatedAt: true,
});

export const insertSelfDestructSchema = createInsertSchema(selfDestructs).omit({
  id: true,
  armedAt: true,
  destroyedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertPurgeOperationSchema = createInsertSchema(purgeOperations).omit({
  id: true,
  requestedAt: true,
  exportAckedAt: true,
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  canceledAt: true,
  failedAt: true,
  recordsDestroyed: true,
  tablesDestroyed: true,
});
