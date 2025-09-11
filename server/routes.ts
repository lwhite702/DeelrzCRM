import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from "express";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import Stripe from "stripe";
import {
  insertTenantSchema,
  insertProductSchema,
  insertCustomerSchema,
  insertOrderSchema,
  insertCreditSchema,
  insertCreditTransactionSchema,
  insertPaymentSchema,
  insertTenantSettingsSchema,
  batches,
  products,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

// Initialize Stripe (with graceful handling)
let stripe: Stripe | null = null;
const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;

if (STRIPE_ENABLED) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    console.log("Stripe initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Stripe:", error);
  }
} else {
  console.warn("Stripe not configured - payment processing will be limited to manual methods");
}

// Tenant membership authorization middleware
const requireTenantAccess = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user.claims.sub;
    const { tenantId } = req.params;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }
    
    // Check if user has access to this tenant
    const userTenants = await storage.getUserTenants(userId);
    const hasAccess = userTenants.some(ut => ut.tenantId === tenantId);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        message: "Access denied: You don't have permission to access this tenant's data" 
      });
    }
    
    next();
  } catch (error) {
    console.error("Tenant authorization error:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Tenant management routes (not tenant-scoped)
  app.get("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userTenants = await storage.getUserTenants(userId);
      res.json(userTenants);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.post("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check if user is super admin
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const tenantData = insertTenantSchema.parse(req.body);
      const tenant = await storage.createTenant(tenantData);
      
      // Add creating user as owner
      await storage.addUserToTenant({
        userId: userId,
        tenantId: tenant.id,
        role: "owner",
      });

      res.json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  // Global feature flag routes (not tenant-scoped)
  app.get("/api/feature-flags", isAuthenticated, async (req: any, res) => {
    try {
      const flags = await storage.getFeatureFlags();
      res.json(flags);
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      res.status(500).json({ message: "Failed to fetch feature flags" });
    }
  });

  // Create tenant router with centralized authorization
  const tenantRouter = Router({ mergeParams: true });
  
  // Apply global middleware to ALL tenant routes
  app.use('/api/tenants/:tenantId', isAuthenticated, requireTenantAccess, tenantRouter);

  // Feature flag routes (tenant-scoped)
  tenantRouter.get("/feature-flags", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const flags = await storage.getTenantFeatureFlags(tenantId);
      res.json(flags);
    } catch (error) {
      console.error("Error fetching tenant feature flags:", error);
      res.status(500).json({ message: "Failed to fetch tenant feature flags" });
    }
  });

  tenantRouter.post("/feature-flags", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { flagKey, enabled } = req.body;
      
      if (!flagKey || typeof enabled !== 'boolean') {
        return res.status(400).json({ 
          message: "Invalid request: flagKey and enabled boolean are required" 
        });
      }
      
      // Validate that the flagKey exists in the featureFlags table
      const allFlags = await storage.getFeatureFlags();
      const flagExists = allFlags.some(flag => flag.key === flagKey);
      
      if (!flagExists) {
        return res.status(400).json({ 
          message: `Invalid flagKey: '${flagKey}' does not exist in the system` 
        });
      }
      
      const override = await storage.updateFeatureFlagOverride({
        tenantId,
        flagKey,
        enabled,
      });
      
      // Return updated flags for the tenant
      const updatedFlags = await storage.getTenantFeatureFlags(tenantId);
      res.json(updatedFlags);
    } catch (error) {
      console.error("Error updating feature flag override:", error);
      res.status(500).json({ message: "Failed to update feature flag" });
    }
  });

  // Product routes (Inventory module)
  tenantRouter.get("/products", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const withInventory = req.query.with_inventory === 'true';
      
      if (withInventory) {
        const products = await storage.getProductsWithInventory(tenantId);
        res.json(products);
      } else {
        const products = await storage.getProducts(tenantId);
        res.json(products);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  tenantRouter.post("/products", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const productData = insertProductSchema.parse({
        ...req.body,
        tenantId,
      });
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Customer routes
  tenantRouter.get("/customers", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const withDetails = req.query.with_details === 'true';
      
      if (withDetails) {
        const customers = await storage.getCustomersWithDetails(tenantId);
        res.json(customers);
      } else {
        const customers = await storage.getCustomers(tenantId);
        res.json(customers);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  tenantRouter.post("/customers", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const customerData = insertCustomerSchema.parse({
        ...req.body,
        tenantId,
      });
      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // Order routes (Sales module)
  tenantRouter.get("/orders", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const orders = await storage.getOrders(tenantId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  tenantRouter.post("/orders", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.user.claims.sub;
      const orderData = insertOrderSchema.parse({
        ...req.body,
        tenantId,
        createdBy: userId,
      });
      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Dashboard KPIs
  tenantRouter.get("/dashboard/kpis", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const kpis = await storage.getDashboardKPIs(tenantId);
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching dashboard KPIs:", error);
      res.status(500).json({ message: "Failed to fetch dashboard KPIs" });
    }
  });

  // Sales POS calculators
  tenantRouter.post("/orders/assist/qty-to-price", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { productId, quantity } = req.body;
      
      const product = await storage.getProduct(productId, tenantId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get tenant settings for margin calculation
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const targetMargin = parseFloat(tenantSettings?.targetMargin || "0.30");

      // Calculate WAC from batches
      const [wacResult] = await db
        .select({
          wac: sql<number>`COALESCE(SUM(${batches.totalCost}) / NULLIF(SUM(${batches.qtyAcquired}), 0), 8.50)`,
        })
        .from(batches)
        .innerJoin(products, eq(batches.productId, products.id))
        .where(and(eq(batches.productId, productId), eq(products.tenantId, tenantId)));

      const baseWAC = wacResult?.wac || 8.50; // fallback if no batches
      const unitPrice = baseWAC * (1 + targetMargin); // Add target margin
      const total = unitPrice * quantity;

      res.json({
        quantity,
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        total: total.toFixed(2),
      });
    } catch (error) {
      console.error("Error calculating qty to price:", error);
      res.status(500).json({ message: "Failed to calculate price" });
    }
  });

  tenantRouter.post("/orders/assist/amount-to-qty", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { productId, targetAmount } = req.body;
      
      const product = await storage.getProduct(productId, tenantId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get tenant settings for margin calculation
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const targetMargin = parseFloat(tenantSettings?.targetMargin || "0.30");

      // Calculate WAC from batches
      const [wacResult] = await db
        .select({
          wac: sql<number>`COALESCE(SUM(${batches.totalCost}) / NULLIF(SUM(${batches.qtyAcquired}), 0), 8.50)`,
        })
        .from(batches)
        .innerJoin(products, eq(batches.productId, products.id))
        .where(and(eq(batches.productId, productId), eq(products.tenantId, tenantId)));

      const baseWAC = wacResult?.wac || 8.50; // fallback if no batches
      const unitPrice = baseWAC * (1 + targetMargin); // Add target margin
      const maxQuantity = Math.floor(targetAmount / unitPrice);
      const actualTotal = maxQuantity * unitPrice;
      const change = targetAmount - actualTotal;

      res.json({
        suggestedQuantity: maxQuantity,
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        actualTotal: actualTotal.toFixed(2),
        change: change.toFixed(2),
      });
    } catch (error) {
      console.error("Error calculating amount to qty:", error);
      res.status(500).json({ message: "Failed to calculate quantity" });
    }
  });

  // Delivery fee estimation
  tenantRouter.post("/delivery/estimate", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { pickupLat, pickupLon, dropoffLat, dropoffLon } = req.body;
      
      // Simplified distance calculation (would use proper geocoding service)
      const distance = Math.sqrt(
        Math.pow(dropoffLat - pickupLat, 2) + Math.pow(dropoffLon - pickupLon, 2)
      ) * 69; // rough miles conversion
      
      const baseFee = 5.00;
      const perMileFee = 1.50;
      const estimatedFee = baseFee + (distance * perMileFee);
      const estimatedTime = Math.max(15, distance * 3); // 3 minutes per mile, min 15

      res.json({
        distance: distance.toFixed(2),
        fee: estimatedFee.toFixed(2),
        estimatedMinutes: Math.round(estimatedTime),
      });
    } catch (error) {
      console.error("Error estimating delivery fee:", error);
      res.status(500).json({ message: "Failed to estimate delivery fee" });
    }
  });

  // Tenant settings routes
  tenantRouter.get("/settings", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      let settings = await storage.getTenantSettings(tenantId);
      
      // Lazy backfill for dev/test environments - seed if empty
      if (!settings && process.env.NODE_ENV !== 'production') {
        settings = await storage.seedTenantSettings(tenantId);
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch tenant settings" });
    }
  });

  tenantRouter.put("/settings", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      
      // Validate request body
      const validatedSettings = insertTenantSettingsSchema.parse(req.body);
      
      // Check if settings exist, if not create them
      let settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        settings = await storage.createTenantSettings(tenantId, validatedSettings);
      } else {
        settings = await storage.updateTenantSettings(tenantId, validatedSettings);
      }
      
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid settings data", 
          errors: error.errors 
        });
      }
      console.error("Error updating tenant settings:", error);
      res.status(500).json({ message: "Failed to update tenant settings" });
    }
  });

  // Loyalty accounts routes
  tenantRouter.get("/loyalty", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      let loyaltyAccounts = await storage.getLoyaltyAccounts(tenantId);
      
      // Lazy backfill for dev/test environments - seed if empty
      if (loyaltyAccounts.length === 0 && process.env.NODE_ENV !== 'production') {
        await storage.seedLoyaltyForTenant(tenantId);
        loyaltyAccounts = await storage.getLoyaltyAccounts(tenantId);
      }
      
      res.json(loyaltyAccounts);
    } catch (error) {
      console.error("Error fetching loyalty accounts:", error);
      res.status(500).json({ message: "Failed to fetch loyalty accounts" });
    }
  });

  // Credit accounts routes
  tenantRouter.get("/credit", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      let creditAccounts = await storage.getCreditAccounts(tenantId);
      
      // Lazy backfill for dev/test environments - seed if empty
      if (creditAccounts.length === 0 && process.env.NODE_ENV !== 'production') {
        await storage.seedCreditForTenant(tenantId);
        creditAccounts = await storage.getCreditAccounts(tenantId);
      }
      
      res.json(creditAccounts);
    } catch (error) {
      console.error("Error fetching credit accounts:", error);
      res.status(500).json({ message: "Failed to fetch credit accounts" });
    }
  });

  tenantRouter.post("/credit", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      
      // Validate input data
      const validationResult = insertCreditSchema.safeParse({
        ...req.body,
        tenantId,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid credit account data",
          errors: validationResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      
      const credit = await storage.createCredit(validationResult.data);
      res.status(201).json(credit);
    } catch (error: any) {
      console.error("Error creating credit account:", error);
      
      if (error.message?.includes('duplicate') || error.code === '23505') {
        return res.status(409).json({ message: "Credit account already exists for this customer" });
      }
      
      if (error.message?.includes('foreign key') || error.code === '23503') {
        return res.status(400).json({ message: "Invalid customer ID or tenant ID" });
      }
      
      res.status(500).json({ message: "Failed to create credit account" });
    }
  });

  // Credit transactions routes
  tenantRouter.get("/credit-transactions", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const creditTransactions = await storage.getCreditTransactions(tenantId);
      res.json(creditTransactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      res.status(500).json({ message: "Failed to fetch credit transactions" });
    }
  });

  tenantRouter.post("/credit-transactions", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      
      // Validate input data
      const validationResult = insertCreditTransactionSchema.safeParse({
        ...req.body,
        tenantId,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid transaction data",
          errors: validationResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      
      const transaction = await storage.createCreditTransaction(validationResult.data);
      res.status(201).json(transaction);
    } catch (error: any) {
      console.error("Error creating credit transaction:", error);
      
      if (error.message?.includes('No credit account found')) {
        return res.status(404).json({ message: "Credit account not found for this customer" });
      }
      
      if (error.message?.includes('exceed credit limit')) {
        return res.status(400).json({ message: error.message });
      }
      
      if (error.message?.includes('foreign key') || error.code === '23503') {
        return res.status(400).json({ message: "Invalid customer ID, order ID, or tenant ID" });
      }
      
      res.status(500).json({ message: "Failed to create credit transaction" });
    }
  });

  // Update credit balance
  tenantRouter.put("/credit/:creditId/balance", async (req: any, res) => {
    try {
      const { tenantId, creditId } = req.params;
      const { balance } = req.body;
      
      // Validate balance input
      if (typeof balance !== 'string' || isNaN(parseFloat(balance))) {
        return res.status(400).json({ 
          message: "Invalid balance value", 
          details: "Balance must be a valid numeric string" 
        });
      }
      
      const balanceNumber = parseFloat(balance);
      if (balanceNumber < 0) {
        return res.status(400).json({ 
          message: "Invalid balance value", 
          details: "Balance cannot be negative" 
        });
      }
      
      // Validate UUID format for creditId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(creditId)) {
        return res.status(400).json({ 
          message: "Invalid credit ID format" 
        });
      }
      
      const updatedCredit = await storage.updateCreditBalance(creditId, tenantId, balance);
      
      if (!updatedCredit) {
        return res.status(404).json({ 
          message: "Credit account not found or you don't have permission to access it" 
        });
      }
      
      res.json(updatedCredit);
    } catch (error: any) {
      console.error("Error updating credit balance:", error);
      
      if (error.code === '23503') {
        return res.status(404).json({ message: "Credit account not found" });
      }
      
      res.status(500).json({ message: "Failed to update credit balance" });
    }
  });

  // Payment routes
  tenantRouter.get("/payments", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const payments = await storage.getPayments(tenantId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  tenantRouter.get("/payments/statistics", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const statistics = await storage.getPaymentStatistics(tenantId);
      res.json(statistics);
    } catch (error) {
      console.error("Error fetching payment statistics:", error);
      res.status(500).json({ message: "Failed to fetch payment statistics" });
    }
  });

  tenantRouter.get("/payments/settings", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const settings = await storage.getPaymentSettings(tenantId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching payment settings:", error);
      res.status(500).json({ message: "Failed to fetch payment settings" });
    }
  });

  tenantRouter.post("/payments", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.user.claims.sub;
      
      const paymentData = insertPaymentSchema.parse({
        ...req.body,
        tenantId,
        createdBy: userId,
      });
      
      const payment = await storage.createPayment(paymentData);
      res.json(payment);
    } catch (error: any) {
      console.error("Error creating payment:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid payment data", 
          errors: error.errors 
        });
      }
      
      if (error.code === '23503') {
        return res.status(404).json({ message: "Customer or order not found" });
      }
      
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  tenantRouter.put("/payments/:paymentId/status", async (req: any, res) => {
    try {
      const { tenantId, paymentId } = req.params;
      const { status, metadata } = req.body;
      
      // Validate status
      const validStatuses = ["pending", "completed", "failed", "refunded"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }
      
      // Validate paymentId format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(paymentId)) {
        return res.status(400).json({ message: "Invalid payment ID format" });
      }
      
      const updatedPayment = await storage.updatePaymentStatus(paymentId, tenantId, status, metadata);
      res.json(updatedPayment);
    } catch (error: any) {
      console.error("Error updating payment status:", error);
      
      if (error.code === '23503') {
        return res.status(404).json({ message: "Payment not found" });
      }
      
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  tenantRouter.post("/payments/seed", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      await storage.seedPaymentsForTenant(tenantId);
      res.json({ message: "Payment data seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding payments:", error);
      
      if (error.message?.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to seed payment data" });
    }
  });

  // Stripe payment processing routes
  tenantRouter.post("/create-payment-intent", async (req: any, res) => {
    try {
      if (!STRIPE_ENABLED || !stripe) {
        return res.status(503).json({ 
          message: "Stripe payment processing is not configured. Please contact support or use manual payment methods." 
        });
      }

      const { tenantId } = req.params;
      const { amount, currency = "usd", customerId, orderId, description } = req.body;
      const userId = req.user.claims.sub;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      // Get tenant payment settings
      const paymentSettings = await storage.getPaymentSettings(tenantId);
      
      // Create payment intent with Stripe
      const paymentIntentParams: any = {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: {
          tenantId,
          customerId: customerId || null,
          orderId: orderId || null,
        },
      };

      // Add application fee if configured
      if (paymentSettings.applicationFeeBps > 0) {
        const applicationFee = Math.round((amount * paymentSettings.applicationFeeBps) / 10000 * 100);
        paymentIntentParams.application_fee_amount = applicationFee;
      }

      // For connect accounts, use connected account
      if (paymentSettings.paymentMode !== "platform" && paymentSettings.stripeAccountId) {
        paymentIntentParams.on_behalf_of = paymentSettings.stripeAccountId;
        paymentIntentParams.transfer_data = {
          destination: paymentSettings.stripeAccountId,
        };
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

      // Create payment record in our database
      const paymentData = {
        tenantId,
        customerId: customerId || null,
        orderId: orderId || null,
        amount: amount.toFixed(2),
        currency,
        status: "pending" as const,
        method: "card" as const,
        paymentIntentId: paymentIntent.id,
        notes: description || null,
        applicationFeeBps: paymentSettings.applicationFeeBps,
        processingFeeCents: paymentIntentParams.application_fee_amount || 0,
        createdBy: userId,
      };

      const payment = await storage.createPayment(paymentData);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentId: payment.id,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        message: "Error creating payment intent", 
        error: error.message 
      });
    }
  });

  tenantRouter.post("/confirm-payment", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { paymentIntentId, status, chargeId, failureReason } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({ message: "Payment intent ID is required" });
      }

      // Find the payment record
      const payments = await storage.getPayments(tenantId);
      const payment = payments.find(p => p.paymentIntentId === paymentIntentId);

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      // Update payment status based on result
      const updateData: any = {
        status: status || "completed",
      };

      if (chargeId) {
        updateData.chargeId = chargeId;
      }

      if (failureReason) {
        updateData.failureReason = failureReason;
        updateData.status = "failed";
      }

      const updatedPayment = await storage.updatePaymentStatus(
        payment.id, 
        tenantId, 
        updateData.status, 
        updateData
      );

      res.json(updatedPayment);
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ 
        message: "Error confirming payment", 
        error: error.message 
      });
    }
  });

  app.post("/api/tenants/:tenantId/refund-payment", isAuthenticated, requireTenantAccess, async (req: any, res) => {
    try {
      if (!STRIPE_ENABLED || !stripe) {
        return res.status(503).json({ 
          message: "Stripe refund processing is not configured. Please contact support for manual refunds." 
        });
      }

      const { tenantId } = req.params;
      const { paymentId, amount, reason } = req.body;

      if (!paymentId) {
        return res.status(400).json({ message: "Payment ID is required" });
      }

      // Find the payment record
      const payments = await storage.getPayments(tenantId);
      const payment = payments.find(p => p.id === paymentId);

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (payment.status !== "completed") {
        return res.status(400).json({ message: "Can only refund completed payments" });
      }

      if (!payment.chargeId) {
        return res.status(400).json({ message: "No charge ID found for refund" });
      }

      // Create refund with Stripe
      const refundParams: any = {
        charge: payment.chargeId,
        reason: reason || "requested_by_customer",
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100); // Convert to cents
      }

      const refund = await stripe.refunds.create(refundParams);

      // Update payment record
      await storage.updatePaymentStatus(
        payment.id,
        tenantId,
        "refunded",
        {
          refundId: refund.id,
          refundAmount: refund.amount / 100,
          refundReason: reason,
        }
      );

      res.json({
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      });
    } catch (error: any) {
      console.error("Error processing refund:", error);
      res.status(500).json({ 
        message: "Error processing refund", 
        error: error.message 
      });
    }
  });

  // Delivery routes
  app.get("/api/tenants/:tenantId/deliveries", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const deliveries = await storage.getDeliveries(tenantId);
      res.json(deliveries);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
      res.status(500).json({ message: "Failed to fetch deliveries" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
