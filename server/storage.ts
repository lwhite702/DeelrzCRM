import {
  users,
  tenants,
  usersTenants,
  featureFlags,
  featureFlagOverrides,
  products,
  batches,
  inventoryLots,
  customers,
  orders,
  orderItems,
  loyaltyAccounts,
  credits,
  settingsTenant,
  type User,
  type UpsertUser,
  type Tenant,
  type InsertTenant,
  type UserTenant,
  type InsertUserTenant,
  type Product,
  type InsertProduct,
  type Customer,
  type InsertCustomer,
  type Order,
  type InsertOrder,
  type FeatureFlag,
  type FeatureFlagOverride,
  type InsertFeatureFlagOverride,
  type LoyaltyAccount,
  type Credit,
  type TenantSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tenant operations
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  getUserTenants(userId: string): Promise<(UserTenant & { tenant: Tenant })[]>;
  addUserToTenant(data: InsertUserTenant): Promise<UserTenant>;
  
  // Feature flags
  getFeatureFlags(): Promise<FeatureFlag[]>;
  getTenantFeatureFlags(tenantId: string): Promise<Record<string, boolean>>;
  updateFeatureFlagOverride(data: InsertFeatureFlagOverride): Promise<FeatureFlagOverride>;
  
  // Products
  getProducts(tenantId: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(id: string, tenantId: string): Promise<Product | undefined>;
  
  // Customers
  getCustomers(tenantId: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getCustomer(id: string, tenantId: string): Promise<Customer | undefined>;
  
  // Orders
  getOrders(tenantId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: string, tenantId: string): Promise<Order | undefined>;
  
  // Dashboard KPIs
  getDashboardKPIs(tenantId: string): Promise<{
    todayRevenue: string;
    ordersToday: number;
    lowStockItems: number;
    overdueCredits: string;
  }>;
  
  // Settings
  getTenantSettings(tenantId: string): Promise<TenantSettings | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tenant operations
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async getUserTenants(userId: string): Promise<(UserTenant & { tenant: Tenant })[]> {
    return await db
      .select({
        userId: usersTenants.userId,
        tenantId: usersTenants.tenantId,
        role: usersTenants.role,
        createdAt: usersTenants.createdAt,
        tenant: tenants,
      })
      .from(usersTenants)
      .leftJoin(tenants, eq(usersTenants.tenantId, tenants.id))
      .where(eq(usersTenants.userId, userId));
  }

  async addUserToTenant(data: InsertUserTenant): Promise<UserTenant> {
    const [userTenant] = await db.insert(usersTenants).values(data).returning();
    return userTenant;
  }

  // Feature flags
  async getFeatureFlags(): Promise<FeatureFlag[]> {
    return await db.select().from(featureFlags);
  }

  async getTenantFeatureFlags(tenantId: string): Promise<Record<string, boolean>> {
    const flags = await db.select().from(featureFlags);
    const overrides = await db
      .select()
      .from(featureFlagOverrides)
      .where(eq(featureFlagOverrides.tenantId, tenantId));

    const result: Record<string, boolean> = {};
    
    for (const flag of flags) {
      const override = overrides.find(o => o.flagKey === flag.key);
      result[flag.key] = override ? override.enabled : flag.defaultEnabled;
    }
    
    return result;
  }

  async updateFeatureFlagOverride(data: InsertFeatureFlagOverride): Promise<FeatureFlagOverride> {
    const [override] = await db
      .insert(featureFlagOverrides)
      .values(data)
      .onConflictDoUpdate({
        target: [featureFlagOverrides.tenantId, featureFlagOverrides.flagKey],
        set: {
          enabled: data.enabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return override;
  }

  // Products
  async getProducts(tenantId: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.tenantId, tenantId));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async getProduct(id: string, tenantId: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
    return product;
  }

  // Customers
  async getCustomers(tenantId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.tenantId, tenantId));
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async getCustomer(id: string, tenantId: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    return customer;
  }

  // Orders
  async getOrders(tenantId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt));
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async getOrder(id: string, tenantId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
    return order;
  }

  // Dashboard KPIs
  async getDashboardKPIs(tenantId: string): Promise<{
    todayRevenue: string;
    ordersToday: number;
    lowStockItems: number;
    overdueCredits: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's revenue
    const [revenueResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "completed"),
          sql`${orders.createdAt} >= ${today}`,
          sql`${orders.createdAt} < ${tomorrow}`
        )
      );

    // Orders today
    const [ordersResult] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          sql`${orders.createdAt} >= ${today}`,
          sql`${orders.createdAt} < ${tomorrow}`
        )
      );

    // Low stock items (simplified - would need proper inventory calculation)
    const [lowStockResult] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    // Overdue credits (simplified)
    const [creditsResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${credits.balance}), 0)`,
      })
      .from(credits)
      .where(
        and(
          eq(credits.tenantId, tenantId),
          eq(credits.status, "active"),
          sql`${credits.balance} > 0`
        )
      );

    return {
      todayRevenue: revenueResult?.total || "0",
      ordersToday: ordersResult?.count || 0,
      lowStockItems: Math.floor((lowStockResult?.count || 0) * 0.1), // 10% for demo
      overdueCredits: creditsResult?.total || "0",
    };
  }

  // Settings
  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    const [settings] = await db
      .select()
      .from(settingsTenant)
      .where(eq(settingsTenant.tenantId, tenantId));
    return settings;
  }
}

export const storage = new DatabaseStorage();
