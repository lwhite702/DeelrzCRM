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
  creditTransactions,
  settingsTenant,
  deliveries,
  payments,
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
  type InsertCredit,
  type CreditTransaction,
  type InsertCreditTransaction,
  type Payment,
  type InsertPayment,
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
  getProductsWithInventory(tenantId: string): Promise<Array<Product & { 
    currentStock: number; 
    wac: string; 
    minStockThreshold: number;
    stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  }>>;
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(id: string, tenantId: string): Promise<Product | undefined>;
  
  // Customers
  getCustomers(tenantId: string): Promise<Customer[]>;
  getCustomersWithDetails(tenantId: string): Promise<Array<Customer & { 
    loyaltyTier?: string; 
    loyaltyPoints?: number;
    creditLimit?: string; 
    creditBalance?: string;
    creditStatus?: string;
  }>>;
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
  createTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings>;
  updateTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings>;
  seedTenantSettings(tenantId: string): Promise<TenantSettings>;
  
  // Loyalty
  getLoyaltyAccounts(tenantId: string): Promise<(LoyaltyAccount & { customerName: string })[]>;
  
  // Credit
  getCreditAccounts(tenantId: string): Promise<(Credit & { customerName: string })[]>;
  getCreditTransactions(tenantId: string): Promise<Array<CreditTransaction & { 
    customerName: string;
    lastPayment?: string;
    nextDue?: string;
    overdue?: boolean;
  }>>;
  createCredit(credit: InsertCredit): Promise<Credit>;
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  updateCreditBalance(creditId: string, tenantId: string, newBalance: string): Promise<Credit>;
  seedCreditForTenant(tenantId: string): Promise<void>;
  
  // Payments
  getPayments(tenantId: string): Promise<Array<Payment & { customerName?: string }>>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentStatus(paymentId: string, tenantId: string, status: string, metadata?: any): Promise<Payment>;
  getPaymentStatistics(tenantId: string): Promise<{
    todayProcessed: string;
    todayPending: string;
    todayFailed: number;
    totalVolume: string;
  }>;
  getPaymentSettings(tenantId: string): Promise<{
    paymentMode: string;
    applicationFeeBps: number;
    defaultCurrency: string;
    stripeAccountId?: string;
  }>;
  seedPaymentsForTenant(tenantId: string): Promise<void>;
  
  // Deliveries
  getDeliveries(tenantId: string): Promise<Array<{
    id: string;
    orderId: string;
    method: string;
    addressLine1: string;
    city: string;
    state: string;
    fee: string;
    status: string;
    createdAt: Date | null;
    orderTotal: string;
    customerName: string;
    customerPhone?: string;
  }>>;
  
  // Development/Test Seeding
  seedLoyaltyForTenant(tenantId: string): Promise<void>;
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
    const results = await db
      .select({
        userId: usersTenants.userId,
        tenantId: usersTenants.tenantId,
        role: usersTenants.role,
        createdAt: usersTenants.createdAt,
        tenant: tenants,
      })
      .from(usersTenants)
      .innerJoin(tenants, eq(usersTenants.tenantId, tenants.id))
      .where(eq(usersTenants.userId, userId));
    
    return results as (UserTenant & { tenant: Tenant })[];
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

  async getProductsWithInventory(tenantId: string): Promise<Array<Product & { 
    currentStock: number; 
    wac: string; 
    minStockThreshold: number;
    stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  }>> {
    // Get tenant settings for min stock threshold
    const tenantSettings = await this.getTenantSettings(tenantId);
    const minStockThreshold = tenantSettings?.minStockThreshold || 10;

    // Get all products for the tenant
    const productList = await this.getProducts(tenantId);
    
    // Efficient bulk queries: get stock aggregates for all products at once
    const stockAggregates = await db
      .select({
        productId: inventoryLots.productId,
        totalStock: sql<number>`COALESCE(SUM(${inventoryLots.qtyRemaining}), 0)`,
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .where(eq(products.tenantId, tenantId))
      .groupBy(inventoryLots.productId);

    // Get WAC aggregates for all products at once (proper weighted average)
    const wacAggregates = await db
      .select({
        productId: batches.productId,
        wac: sql<number>`COALESCE(SUM(${batches.totalCost}) / NULLIF(SUM(${batches.qtyAcquired}), 0), 0)`,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(eq(products.tenantId, tenantId))
      .groupBy(batches.productId);

    // Create lookup maps for efficient access
    const stockMap = new Map(stockAggregates.map(s => [s.productId, s.totalStock]));
    const wacMap = new Map(wacAggregates.map(w => [w.productId, w.wac]));
    
    // Combine data for each product
    const productsWithInventory = productList.map(product => {
      const currentStock = stockMap.get(product.id) || 0;
      const wac = wacMap.get(product.id) || 0;

      // Determine stock status
      let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
      if (currentStock === 0) {
        stockStatus = 'out_of_stock';
      } else if (currentStock <= minStockThreshold) {
        stockStatus = 'low_stock';
      } else {
        stockStatus = 'in_stock';
      }

      return {
        ...product,
        currentStock,
        wac: wac.toFixed(2),
        minStockThreshold,
        stockStatus,
      };
    });

    return productsWithInventory;
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

  async getCustomersWithDetails(tenantId: string): Promise<Array<Customer & { 
    loyaltyTier?: string; 
    loyaltyPoints?: number;
    creditLimit?: string; 
    creditBalance?: string;
    creditStatus?: string;
  }>> {
    // Get all customers for the tenant
    const customerList = await this.getCustomers(tenantId);

    // Get loyalty data for all customers in one query
    const loyaltyData = await db
      .select({
        customerId: loyaltyAccounts.customerId,
        tier: loyaltyAccounts.tier,
        points: loyaltyAccounts.points,
      })
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.tenantId, tenantId));

    // Get credit data for all customers in one query
    const creditData = await db
      .select({
        customerId: credits.customerId,
        limitAmount: credits.limitAmount,
        balance: credits.balance,
        status: credits.status,
      })
      .from(credits)
      .where(eq(credits.tenantId, tenantId));

    // Create lookup maps for efficient access
    const loyaltyMap = new Map(loyaltyData.map(l => [l.customerId, l]));
    const creditMap = new Map(creditData.map(c => [c.customerId, c]));

    // Combine data for each customer
    const customersWithDetails = customerList.map(customer => {
      const loyalty = loyaltyMap.get(customer.id);
      const credit = creditMap.get(customer.id);

      return {
        ...customer,
        loyaltyTier: loyalty?.tier,
        loyaltyPoints: loyalty?.points,
        creditLimit: credit?.limitAmount,
        creditBalance: credit?.balance,
        creditStatus: credit?.status,
      };
    });

    return customersWithDetails;
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

  async createTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings> {
    const [newSettings] = await db
      .insert(settingsTenant)
      .values({ ...settings, tenantId })
      .returning();
    return newSettings;
  }

  async updateTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings> {
    const [updatedSettings] = await db
      .update(settingsTenant)
      .set(settings)
      .where(eq(settingsTenant.tenantId, tenantId))
      .returning();
    return updatedSettings;
  }

  async seedTenantSettings(tenantId: string): Promise<TenantSettings> {
    // Create default settings for a new tenant
    const defaultSettings = {
      tenantId,
      targetMargin: "0.3000",
      minStockThreshold: 10,
      exposureCap: "10000.00",
      deliveryMethodsEnabled: "pickup,manual_courier",
      leadTimeDays: 7,
      safetyDays: 3,
      paymentMode: "platform" as const,
      applicationFeeBps: 0,
      defaultCurrency: "usd",
    };

    return this.createTenantSettings(tenantId, defaultSettings);
  }

  // Loyalty
  async getLoyaltyAccounts(tenantId: string): Promise<(LoyaltyAccount & { customerName: string })[]> {
    const results = await db
      .select({
        id: loyaltyAccounts.id,
        tenantId: loyaltyAccounts.tenantId,
        customerId: loyaltyAccounts.customerId,
        points: loyaltyAccounts.points,
        tier: loyaltyAccounts.tier,
        updatedAt: loyaltyAccounts.updatedAt,
        customerName: customers.name,
      })
      .from(loyaltyAccounts)
      .innerJoin(customers, eq(loyaltyAccounts.customerId, customers.id))
      .where(eq(loyaltyAccounts.tenantId, tenantId));
    
    return results as (LoyaltyAccount & { customerName: string })[];
  }

  // Credit
  async getCreditAccounts(tenantId: string): Promise<(Credit & { customerName: string })[]> {
    const results = await db
      .select({
        id: credits.id,
        tenantId: credits.tenantId,
        customerId: credits.customerId,
        limitAmount: credits.limitAmount,
        balance: credits.balance,
        status: credits.status,
        updatedAt: credits.updatedAt,
        customerName: customers.name,
      })
      .from(credits)
      .innerJoin(customers, eq(credits.customerId, customers.id))
      .where(eq(credits.tenantId, tenantId));
    
    return results as (Credit & { customerName: string })[];
  }

  async getCreditTransactions(tenantId: string): Promise<Array<CreditTransaction & { 
    customerName: string;
    lastPayment?: string;
    nextDue?: string;
    overdue?: boolean;
  }>> {
    const results = await db
      .select({
        id: creditTransactions.id,
        tenantId: creditTransactions.tenantId,
        customerId: creditTransactions.customerId,
        orderId: creditTransactions.orderId,
        amount: creditTransactions.amount,
        fee: creditTransactions.fee,
        dueDate: creditTransactions.dueDate,
        paidDate: creditTransactions.paidDate,
        status: creditTransactions.status,
        createdAt: creditTransactions.createdAt,
        customerName: customers.name,
      })
      .from(creditTransactions)
      .innerJoin(customers, eq(creditTransactions.customerId, customers.id))
      .where(eq(creditTransactions.tenantId, tenantId))
      .orderBy(desc(creditTransactions.createdAt));

    return results.map(r => {
      const now = new Date();
      const overdue = r.dueDate && r.status === 'pending' && r.dueDate < now;
      
      return {
        ...r,
        lastPayment: r.paidDate?.toISOString(),
        nextDue: r.dueDate?.toISOString(),
        overdue: Boolean(overdue),
      };
    }) as Array<CreditTransaction & { 
      customerName: string;
      lastPayment?: string;
      nextDue?: string;
      overdue?: boolean;
    }>;
  }

  async createCredit(credit: InsertCredit): Promise<Credit> {
    const [newCredit] = await db.insert(credits).values(credit).returning();
    return newCredit;
  }

  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      // Find the customer's credit account
      const [creditAccount] = await tx
        .select()
        .from(credits)
        .where(
          and(
            eq(credits.customerId, transaction.customerId),
            eq(credits.tenantId, transaction.tenantId)
          )
        );
      
      if (!creditAccount) {
        throw new Error(`No credit account found for customer ${transaction.customerId}`);
      }
      
      // Create the transaction
      const [newTransaction] = await tx.insert(creditTransactions).values(transaction).returning();
      
      // Calculate new balance (add transaction amount to current balance)
      const currentBalance = parseFloat(creditAccount.balance);
      const transactionAmount = parseFloat(transaction.amount);
      const newBalance = (currentBalance + transactionAmount).toFixed(2);
      
      // Check if new balance exceeds credit limit
      const creditLimit = parseFloat(creditAccount.limitAmount);
      if (parseFloat(newBalance) > creditLimit) {
        throw new Error(`Transaction would exceed credit limit. Current: $${currentBalance.toFixed(2)}, Limit: $${creditLimit.toFixed(2)}, Requested: $${transactionAmount.toFixed(2)}`);
      }
      
      // Update the credit account balance
      await tx
        .update(credits)
        .set({ 
          balance: newBalance,
          updatedAt: new Date() 
        })
        .where(eq(credits.id, creditAccount.id));
      
      return newTransaction;
    });
  }

  async updateCreditBalance(creditId: string, tenantId: string, newBalance: string): Promise<Credit> {
    const [updatedCredit] = await db
      .update(credits)
      .set({ 
        balance: newBalance, 
        updatedAt: new Date() 
      })
      .where(and(eq(credits.id, creditId), eq(credits.tenantId, tenantId)))
      .returning();
    return updatedCredit;
  }

  async seedCreditForTenant(tenantId: string): Promise<void> {
    // Get existing customers for this tenant
    const customers = await this.getCustomers(tenantId);
    
    if (customers.length === 0) {
      console.log(`No customers found for tenant ${tenantId}, skipping credit seeding.`);
      return;
    }

    // Create credit accounts for some customers
    const creditData = [
      {
        tenantId,
        customerId: customers[0]?.id,
        limitAmount: "1000.00",
        balance: "250.00",
        status: "active" as const,
      },
      {
        tenantId,
        customerId: customers[1]?.id,
        limitAmount: "500.00",
        balance: "0.00",
        status: "active" as const,
      },
      {
        tenantId,
        customerId: customers[2]?.id,
        limitAmount: "750.00",
        balance: "450.00",
        status: "suspended" as const,
      },
    ];

    // Filter out any undefined customer IDs and insert credits
    const validCreditData = creditData.filter(data => data.customerId);
    if (validCreditData.length > 0) {
      await db.insert(credits).values(validCreditData).onConflictDoNothing();
    }

    // Create some credit transactions
    const transactionData = [
      {
        tenantId,
        customerId: customers[0]?.id,
        amount: "85.50",
        fee: "2.50",
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        status: "pending" as const,
      },
      {
        tenantId,
        customerId: customers[2]?.id,
        amount: "120.00",
        fee: "5.00",
        dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (overdue)
        status: "overdue" as const,
      },
      {
        tenantId,
        customerId: customers[1]?.id,
        amount: "45.75",
        fee: "1.25",
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        paidDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // paid 5 days ago
        status: "paid" as const,
      },
    ];

    // Filter out any undefined customer IDs and insert transactions
    const validTransactionData = transactionData.filter(data => data.customerId);
    if (validTransactionData.length > 0) {
      await db.insert(creditTransactions).values(validTransactionData).onConflictDoNothing();
    }

    console.log(`Seeded ${validCreditData.length} credit accounts and ${validTransactionData.length} transactions for tenant ${tenantId}`);
  }

  // Payments
  async getPayments(tenantId: string): Promise<Array<Payment & { customerName?: string }>> {
    const results = await db
      .select({
        id: payments.id,
        tenantId: payments.tenantId,
        orderId: payments.orderId,
        customerId: payments.customerId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        method: payments.method,
        paymentIntentId: payments.paymentIntentId,
        chargeId: payments.chargeId,
        transferId: payments.transferId,
        refundId: payments.refundId,
        failureReason: payments.failureReason,
        notes: payments.notes,
        metadata: payments.metadata,
        applicationFeeBps: payments.applicationFeeBps,
        processingFeeCents: payments.processingFeeCents,
        createdBy: payments.createdBy,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        customerName: customers.name,
      })
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .where(eq(payments.tenantId, tenantId))
      .orderBy(desc(payments.createdAt));
    
    return results as Array<Payment & { customerName?: string }>;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async updatePaymentStatus(paymentId: string, tenantId: string, status: string, metadata?: any): Promise<Payment> {
    const [updatedPayment] = await db
      .update(payments)
      .set({ 
        status: status as any,
        metadata: metadata || null,
        updatedAt: new Date() 
      })
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .returning();
    return updatedPayment;
  }

  async getPaymentStatistics(tenantId: string): Promise<{
    todayProcessed: string;
    todayPending: string;
    todayFailed: number;
    totalVolume: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's processed payments
    const [processedResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "completed"),
          sql`${payments.createdAt} >= ${today}`
        )
      );

    // Get today's pending payments
    const [pendingResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "pending"),
          sql`${payments.createdAt} >= ${today}`
        )
      );

    // Get today's failed payment count
    const [failedResult] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "failed"),
          sql`${payments.createdAt} >= ${today}`
        )
      );

    // Get total volume (all time completed payments)
    const [totalResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "completed")
        )
      );

    return {
      todayProcessed: (processedResult?.total || 0).toFixed(2),
      todayPending: (pendingResult?.total || 0).toFixed(2),
      todayFailed: Number(failedResult?.count || 0),
      totalVolume: (totalResult?.total || 0).toFixed(2),
    };
  }

  async getPaymentSettings(tenantId: string): Promise<{
    paymentMode: string;
    applicationFeeBps: number;
    defaultCurrency: string;
    stripeAccountId?: string;
  }> {
    const settings = await this.getTenantSettings(tenantId);
    
    return {
      paymentMode: settings?.paymentMode || "platform",
      applicationFeeBps: settings?.applicationFeeBps || 0,
      defaultCurrency: settings?.defaultCurrency || "usd",
      stripeAccountId: settings?.stripeAccountId || undefined,
    };
  }

  async seedPaymentsForTenant(tenantId: string): Promise<void> {
    // Check if tenant exists
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    // Check if payments already exist for this tenant
    const existingPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.tenantId, tenantId))
      .limit(1);

    if (existingPayments.length > 0) {
      return; // Already seeded
    }

    // Get existing customers for this tenant
    const existingCustomers = await this.getCustomers(tenantId);
    
    if (existingCustomers.length === 0) {
      // Create sample customers first
      const sampleCustomers = [
        {
          tenantId,
          name: 'John Smith',
          phone: '(555) 123-4567',
          email: 'john.smith@example.com',
          preferredFulfillment: 'pickup' as const,
        },
        {
          tenantId,
          name: 'Sarah Johnson', 
          phone: '(555) 234-5678',
          email: 'sarah.johnson@example.com',
          preferredFulfillment: 'delivery' as const,
        },
        {
          tenantId,
          name: 'Mike Wilson',
          phone: '(555) 345-6789',
          email: 'mike.wilson@example.com',
          preferredFulfillment: 'pickup' as const,
        },
      ];

      await db.insert(customers).values(sampleCustomers);
    }

    // Get customers again after potential creation
    const tenantCustomers = await this.getCustomers(tenantId);
    const adminUser = await db.select().from(users).limit(1);
    
    if (!adminUser.length || !tenantCustomers.length) {
      return;
    }

    // Create sample payments
    const samplePayments = [
      {
        tenantId,
        customerId: tenantCustomers[0].id,
        amount: "125.50",
        currency: "usd",
        status: "completed" as const,
        method: "card" as const,
        paymentIntentId: "pi_1234567890",
        chargeId: "ch_1234567890",
        notes: "Payment for prescription order",
        applicationFeeBps: 250,
        processingFeeCents: 89,
        createdBy: adminUser[0].id,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        tenantId,
        customerId: tenantCustomers[1].id,
        amount: "89.75",
        currency: "usd",
        status: "pending" as const,
        method: "cash" as const,
        notes: "Cash payment - exact change provided",
        applicationFeeBps: 0,
        processingFeeCents: 0,
        createdBy: adminUser[0].id,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
      {
        tenantId,
        customerId: tenantCustomers[2].id,
        amount: "67.25",
        currency: "usd",
        status: "failed" as const,
        method: "card" as const,
        paymentIntentId: "pi_5678901234",
        failureReason: "insufficient_funds",
        notes: "Card declined due to insufficient funds",
        applicationFeeBps: 250,
        processingFeeCents: 0,
        createdBy: adminUser[0].id,
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      },
    ];

    // Insert payments
    await db.insert(payments).values(samplePayments);
  }

  // Deliveries
  async getDeliveries(tenantId: string): Promise<Array<{
    id: string;
    orderId: string;
    method: string;
    addressLine1: string;
    city: string;
    state: string;
    fee: string;
    status: string;
    createdAt: Date | null;
    orderTotal: string;
    customerName: string;
    customerPhone?: string;
  }>> {
    const results = await db
      .select({
        id: deliveries.id,
        orderId: deliveries.orderId,
        method: deliveries.method,
        addressLine1: deliveries.addressLine1,
        city: deliveries.city,
        state: deliveries.state,
        fee: deliveries.fee,
        status: deliveries.status,
        createdAt: deliveries.createdAt,
        orderTotal: orders.total,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(deliveries.tenantId, tenantId))
      .orderBy(desc(deliveries.createdAt));

    return results.map(r => ({
      ...r,
      customerName: r.customerName || 'Walk-in Customer',
      addressLine1: r.addressLine1 || '',
      city: r.city || '',
      state: r.state || '',
      customerPhone: r.customerPhone || undefined,
    }));
  }

  // Development/Test Seeding Functions
  async seedLoyaltyForTenant(tenantId: string): Promise<void> {
    // Only run in development/test environments
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    // Check if loyalty accounts already exist for this tenant
    const existingAccounts = await db
      .select({ id: loyaltyAccounts.id })
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.tenantId, tenantId))
      .limit(1);

    if (existingAccounts.length > 0) {
      return; // Already seeded
    }

    // Create sample customers first
    const sampleCustomers = [
      {
        id: `cust-${tenantId}-1`,
        tenantId,
        name: 'John Smith',
        phone: '(555) 123-4567',
        email: 'john.smith@example.com',
        address: '123 Oak Street, Springfield, IL',
      },
      {
        id: `cust-${tenantId}-2`,
        tenantId,
        name: 'Sarah Johnson',
        phone: '(555) 234-5678',
        email: 'sarah.johnson@example.com',
        address: '456 Pine Avenue, Springfield, IL',
      },
      {
        id: `cust-${tenantId}-3`,
        tenantId,
        name: 'Mike Wilson',
        phone: '(555) 345-6789',
        email: 'mike.wilson@example.com',
        address: '789 Elm Drive, Springfield, IL',
      },
    ];

    // Insert customers
    await db.insert(customers).values(sampleCustomers).onConflictDoNothing();

    // Create corresponding loyalty accounts
    const sampleLoyaltyAccounts = [
      {
        id: `loyal-${tenantId}-1`,
        tenantId,
        customerId: `cust-${tenantId}-1`,
        points: 1250,
        tier: 'silver' as const,
        updatedAt: new Date(),
      },
      {
        id: `loyal-${tenantId}-2`,
        tenantId,
        customerId: `cust-${tenantId}-2`,
        points: 2800,
        tier: 'gold' as const,
        updatedAt: new Date(),
      },
      {
        id: `loyal-${tenantId}-3`,
        tenantId,
        customerId: `cust-${tenantId}-3`,
        points: 350,
        tier: 'bronze' as const,
        updatedAt: new Date(),
      },
    ];

    // Insert loyalty accounts
    await db.insert(loyaltyAccounts).values(sampleLoyaltyAccounts).onConflictDoNothing();
  }
}

export const storage = new DatabaseStorage();
