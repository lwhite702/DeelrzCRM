import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from "express";
import express from "express";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import Stripe from "stripe";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import {
  insertTenantSchema,
  insertProductSchema,
  insertCustomerSchema,
  insertOrderSchema,
  insertCreditSchema,
  insertCreditTransactionSchema,
  insertPaymentSchema,
  insertTenantSettingsSchema,
  insertKbArticleSchema,
  insertKbFeedbackSchema,
  insertUserSettingsSchema,
  batches,
  products,
  payments,
  webhookEvents,
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

// Super admin authorization middleware
const requireSuperAdmin = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user.claims.sub;
    
    // Get user and check their role across all tenants
    const userTenants = await storage.getUserTenants(userId);
    const isSuperAdmin = userTenants.some(ut => ut.role === "super_admin");
    
    if (!isSuperAdmin) {
      return res.status(403).json({ 
        message: "Access denied: Super admin role required" 
      });
    }
    
    next();
  } catch (error) {
    console.error("Super admin authorization error:", error);
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

  // User settings routes
  app.get("/api/user/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let settings = await storage.getUserSettings(userId);
      
      // Create default settings if none exist
      if (!settings) {
        settings = await storage.upsertUserSettings(userId, {
          hasCompletedTour: false,
          tourProgress: null,
          helpPreferences: null,
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });

  app.put("/api/user/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settingsData = insertUserSettingsSchema.parse(req.body);
      const settings = await storage.upsertUserSettings(userId, settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Failed to update user settings" });
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
      
      // Strict Zod validation
      const deliveryEstimateSchema = z.object({
        pickupLat: z.number(),
        pickupLon: z.number(),
        dropoffLat: z.number(),
        dropoffLon: z.number(),
        priority: z.enum(["standard", "rush"]).optional().default("standard"),
      }).strict();

      const validatedInput = deliveryEstimateSchema.parse(req.body);
      const { pickupLat, pickupLon, dropoffLat, dropoffLon, priority } = validatedInput;
      
      // Clamp lat/lon ranges
      if (pickupLat < -90 || pickupLat > 90 || dropoffLat < -90 || dropoffLat > 90) {
        return res.status(400).json({ message: "Invalid latitude: must be between -90 and 90" });
      }
      if (pickupLon < -180 || pickupLon > 180 || dropoffLon < -180 || dropoffLon > 180) {
        return res.status(400).json({ message: "Invalid longitude: must be between -180 and 180" });
      }
      
      // Proper haversine formula for distance calculation
      const toRadians = (degrees: number) => degrees * (Math.PI / 180);
      const earthRadiusMiles = 3959;
      
      const lat1Rad = toRadians(pickupLat);
      const lat2Rad = toRadians(dropoffLat);
      const deltaLatRad = toRadians(dropoffLat - pickupLat);
      const deltaLonRad = toRadians(dropoffLon - pickupLon);
      
      const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadiusMiles * c;
      
      // Fee calculation: base=5.0, perMile=1.5, perMin=0.25, minFee=7.0
      const baseFee = 5.0;
      const perMileFee = 1.5;
      const perMinFee = 0.25;
      const minFee = 7.0;
      
      const estimatedMinutes = Math.max(15, Math.round(distance * 3)); // 3 minutes per mile, min 15
      let fee = baseFee + (distance * perMileFee) + (estimatedMinutes * perMinFee);
      
      // Apply minimum fee
      fee = Math.max(fee, minFee);
      
      // Rush adds +30%
      if (priority === "rush") {
        fee *= 1.3;
      }

      res.json({
        distance: `${distance.toFixed(1)} mi`,
        estimatedMinutes: estimatedMinutes,
        fee: fee.toFixed(2),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
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
      const paymentsData = await storage.getPayments(tenantId);
      res.json(paymentsData);
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
      if (!STRIPE_ENABLED || !stripe) {
        return res.status(503).json({ 
          message: "Stripe payment processing is not configured." 
        });
      }

      const { tenantId } = req.params;
      
      // Validate input with Zod strict
      const confirmPaymentSchema = z.object({
        paymentIntentId: z.string(),
        paymentId: z.string(),
      }).strict();

      const { paymentIntentId, paymentId } = confirmPaymentSchema.parse(req.body);

      // Find the payment record
      const paymentsData = await storage.getPayments(tenantId);
      const payment = paymentsData.find(p => p.id === paymentId && p.paymentIntentId === paymentIntentId);

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      // If payment is already in a final state, return it (idempotent)
      if (payment.status === "completed" || payment.status === "failed" || payment.status === "refunded") {
        return res.json(payment);
      }

      // Fetch PaymentIntent from Stripe to get current status
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Use transaction for payment status update
      const updatedPayment = await db.transaction(async (tx) => {
        // Update payment status based on Stripe status
        let updateData: any = {
          status: "pending", // default
        };

        if (paymentIntent.status === "succeeded") {
          updateData.status = "completed";
          // Get charge ID from the latest charge
          if (paymentIntent.latest_charge) {
            updateData.chargeId = typeof paymentIntent.latest_charge === 'string' 
              ? paymentIntent.latest_charge 
              : paymentIntent.latest_charge.id;
          }
        } else if (paymentIntent.status === "requires_payment_method" || paymentIntent.status === "canceled") {
          updateData.status = "failed";
          updateData.failureReason = paymentIntent.last_payment_error?.message || "Payment failed";
        }

        // Update payment status atomically
        const [updatedPayment] = await tx
          .update(payments)
          .set({ 
            status: updateData.status as "pending" | "completed" | "failed" | "refunded",
            metadata: updateData || null,
            updatedAt: new Date() 
          })
          .where(and(eq(payments.id, payment.id), eq(payments.tenantId, tenantId)))
          .returning();
          
        return updatedPayment;
      });

      res.json(updatedPayment);
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
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
      const paymentsData = await storage.getPayments(tenantId);
      const payment = paymentsData.find(p => p.id === paymentId);

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

  // Stripe Webhook endpoint
  app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req: any, res) => {
    try {
      if (!STRIPE_ENABLED || !stripe) {
        return res.status(503).json({ 
          message: "Stripe webhook processing is not configured." 
        });
      }

      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        return res.status(500).json({ message: "Webhook secret not configured" });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ message: `Webhook Error: ${err.message}` });
      }

      // Check for idempotency - prevent duplicate processing
      const existingEvent = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, event.id)).limit(1);
      
      if (existingEvent.length > 0 && existingEvent[0].processed) {
        console.log(`Event ${event.id} already processed, skipping`);
        return res.json({ received: true, skipped: true });
      }

      // Store event for idempotency tracking
      if (existingEvent.length === 0) {
        await db.insert(webhookEvents).values({
          eventId: event.id,
          eventType: event.type,
          processed: false,
          metadata: event.data,
        });
      }

      // Process the event
      try {
        switch (event.type) {
          case 'payment_intent.succeeded':
          case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object as any;
            const tenantId = paymentIntent.metadata?.tenantId;
            
            if (tenantId) {
              // Find payment by paymentIntentId
              const paymentsData = await storage.getPayments(tenantId);
              const payment = paymentsData.find(p => p.paymentIntentId === paymentIntent.id);
              
              if (payment) {
                const updateData: any = {
                  status: event.type === 'payment_intent.succeeded' ? 'completed' : 'failed',
                };
                
                if (event.type === 'payment_intent.succeeded' && paymentIntent.latest_charge) {
                  updateData.chargeId = typeof paymentIntent.latest_charge === 'string' 
                    ? paymentIntent.latest_charge 
                    : paymentIntent.latest_charge.id;
                } else if (event.type === 'payment_intent.payment_failed') {
                  updateData.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
                }
                
                await storage.updatePaymentStatus(payment.id, tenantId, updateData.status, updateData);
                console.log(`Updated payment ${payment.id} status to ${updateData.status}`);
              }
            }
            break;
          }
          
          case 'account.updated': {
            // Handle Connect account updates - refresh tenant settings cache if needed
            const account = event.data.object as any;
            console.log(`Stripe account ${account.id} updated - would refresh tenant cache`);
            break;
          }
          
          default:
            console.log(`Unhandled event type: ${event.type}`);
        }

        // Mark event as processed
        await db.update(webhookEvents)
          .set({ processed: true })
          .where(eq(webhookEvents.eventId, event.id));

        res.json({ received: true });
      } catch (processingError: any) {
        console.error('Error processing webhook event:', processingError);
        res.status(500).json({ message: 'Error processing webhook event' });
      }
    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Delivery Estimator endpoint
  app.post("/api/delivery/estimate", async (req: any, res) => {
    try {
      // Zod validation
      const deliveryEstimateSchema = z.object({
        method: z.enum(["pickup", "manual_courier"]),
        pickup: z.object({
          lat: z.number().optional(),
          lon: z.number().optional(),
          address: z.string().optional(),
        }).optional(),
        dropoff: z.object({
          lat: z.number().optional(),
          lon: z.number().optional(),
          address: z.string().optional(),
        }).optional(),
        weightKg: z.number().optional(),
        priority: z.enum(["standard", "rush"]).optional(),
      }).strict();

      const { method, pickup, dropoff, weightKg, priority } = deliveryEstimateSchema.parse(req.body);

      // Handle pickup method
      if (method === "pickup") {
        return res.json({
          distance: "0 mi",
          estimatedMinutes: 0,
          fee: "0.00"
        });
      }

      // For manual_courier method, calculate distance and fee
      if (!pickup?.lat || !pickup?.lon || !dropoff?.lat || !dropoff?.lon) {
        return res.status(400).json({ 
          message: "Pickup and dropoff coordinates are required for delivery estimation" 
        });
      }

      // Haversine distance calculation
      const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      const distanceMiles = haversineDistance(pickup.lat, pickup.lon, dropoff.lat, dropoff.lon);
      
      // Estimate delivery time: max(5 minutes, distance / 20 mph * 60)
      const estimatedMinutes = Math.max(5, Math.ceil(distanceMiles / 20 * 60));
      
      // Calculate fee - base fee + distance fee + priority surcharge
      let baseFee = 3.99; // Base delivery fee
      const distanceFee = distanceMiles * 0.89; // Per mile fee
      const prioritySurcharge = priority === "rush" ? 2.50 : 0;
      const weightSurcharge = weightKg && weightKg > 5 ? (weightKg - 5) * 0.25 : 0;
      
      const totalFee = baseFee + distanceFee + prioritySurcharge + weightSurcharge;

      res.json({
        distance: `${distanceMiles.toFixed(1)} mi`,
        estimatedMinutes,
        fee: totalFee.toFixed(2)
      });
    } catch (error: any) {
      console.error('Error estimating delivery:', error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Error estimating delivery", 
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

  // Help System Routes
  
  // GET /api/help/articles - List and search knowledge base articles
  app.get("/api/help/articles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { search, category, tenant_only } = req.query;
      
      // Get user's tenants to determine article access
      const userTenants = await storage.getUserTenants(userId);
      const tenantIds = userTenants.map(ut => ut.tenantId);
      
      // Build filters
      const filters: any = {};
      
      if (search) {
        filters.search = search as string;
      }
      
      if (category) {
        filters.category = category as string;
      }
      
      if (tenant_only === 'true') {
        // Only return tenant-specific articles for user's tenants
        // We'll filter in the storage method since we have multiple tenants
        const allArticles = [];
        for (const tenantId of tenantIds) {
          const tenantArticles = await storage.getKbArticles({ 
            ...filters, 
            tenantId, 
            includeGlobal: false 
          });
          allArticles.push(...tenantArticles);
        }
        res.json(allArticles);
      } else {
        // Return global articles plus all tenant-specific articles user has access to
        const globalArticles = await storage.getKbArticles({ 
          ...filters, 
          tenantId: null, 
          includeGlobal: false 
        });
        
        const tenantArticles = [];
        for (const tenantId of tenantIds) {
          const articles = await storage.getKbArticles({ 
            ...filters, 
            tenantId, 
            includeGlobal: false 
          });
          tenantArticles.push(...articles);
        }
        
        // Combine and deduplicate
        const allArticles = [...globalArticles, ...tenantArticles];
        const uniqueArticles = allArticles.filter((article, index, self) => 
          index === self.findIndex(a => a.id === article.id)
        );
        
        res.json(uniqueArticles);
      }
    } catch (error) {
      console.error("Error fetching help articles:", error);
      res.status(500).json({ message: "Failed to fetch help articles" });
    }
  });

  // GET /api/help/articles/:slug - Get single article by slug
  app.get("/api/help/articles/:slug", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { slug } = req.params;
      
      const article = await storage.getKbArticleBySlug(slug);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Check access: global articles or tenant-specific articles user has access to
      if (article.tenantId) {
        const userTenants = await storage.getUserTenants(userId);
        const hasAccess = userTenants.some(ut => ut.tenantId === article.tenantId);
        
        if (!hasAccess) {
          return res.status(403).json({ 
            message: "Access denied: You don't have permission to view this article" 
          });
        }
      }
      
      res.json(article);
    } catch (error) {
      console.error("Error fetching help article:", error);
      res.status(500).json({ message: "Failed to fetch help article" });
    }
  });

  // POST /api/help/articles - Create new knowledge base article (Super Admin only)
  app.post("/api/help/articles", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const articleData = insertKbArticleSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      // Check if slug is unique
      const existingArticle = await storage.getKbArticleBySlug(articleData.slug);
      if (existingArticle) {
        return res.status(409).json({ 
          message: "Article with this slug already exists" 
        });
      }
      
      const article = await storage.createKbArticle(articleData);
      res.status(201).json(article);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid article data", 
          errors: error.errors 
        });
      }
      console.error("Error creating help article:", error);
      res.status(500).json({ message: "Failed to create help article" });
    }
  });

  // PUT /api/help/articles/:id - Update existing article (Super Admin only)
  app.put("/api/help/articles/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Check if article exists
      const existingArticle = await storage.getKbArticleById(id);
      if (!existingArticle) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Parse update data (excluding fields that shouldn't be updated)
      const updateData = insertKbArticleSchema.partial().parse(req.body);
      
      // If slug is being updated, check uniqueness
      if (updateData.slug && updateData.slug !== existingArticle.slug) {
        const conflictingArticle = await storage.getKbArticleBySlug(updateData.slug);
        if (conflictingArticle && conflictingArticle.id !== id) {
          return res.status(409).json({ 
            message: "Article with this slug already exists" 
          });
        }
      }
      
      const updatedArticle = await storage.updateKbArticle(id, updateData);
      res.json(updatedArticle);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid article data", 
          errors: error.errors 
        });
      }
      console.error("Error updating help article:", error);
      res.status(500).json({ message: "Failed to update help article" });
    }
  });

  // DELETE /api/help/articles/:id - Soft delete article (Super Admin only)
  app.delete("/api/help/articles/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Check if article exists
      const existingArticle = await storage.getKbArticleById(id);
      if (!existingArticle) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      if (!existingArticle.isActive) {
        return res.status(410).json({ message: "Article already deleted" });
      }
      
      const deletedArticle = await storage.softDeleteKbArticle(id);
      res.json({ 
        message: "Article deleted successfully", 
        article: deletedArticle 
      });
    } catch (error) {
      console.error("Error deleting help article:", error);
      res.status(500).json({ message: "Failed to delete help article" });
    }
  });

  // POST /api/help/feedback - Record article feedback
  app.post("/api/help/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { articleId, isHelpful } = req.body;
      
      // Validate required fields
      if (!articleId || typeof isHelpful !== 'boolean') {
        return res.status(400).json({ 
          message: "articleId and isHelpful (boolean) are required" 
        });
      }
      
      // Check if article exists and user has access
      const article = await storage.getKbArticleById(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      if (!article.isActive) {
        return res.status(410).json({ message: "Cannot provide feedback on deleted article" });
      }
      
      // Check access for tenant-specific articles
      if (article.tenantId) {
        const userTenants = await storage.getUserTenants(userId);
        const hasAccess = userTenants.some(ut => ut.tenantId === article.tenantId);
        
        if (!hasAccess) {
          return res.status(403).json({ 
            message: "Access denied: You don't have permission to provide feedback on this article" 
          });
        }
      }
      
      // Get user's first tenant for the feedback record (required by schema)
      const userTenants = await storage.getUserTenants(userId);
      const tenantId = userTenants[0]?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "User must be associated with at least one tenant to provide feedback" 
        });
      }
      
      const feedbackData = insertKbFeedbackSchema.parse({
        articleId,
        userId,
        tenantId,
        isHelpful,
      });
      
      const feedback = await storage.upsertKbFeedback(feedbackData);
      res.status(201).json({ 
        message: "Feedback recorded successfully", 
        feedback 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid feedback data", 
          errors: error.errors 
        });
      }
      console.error("Error recording help feedback:", error);
      res.status(500).json({ message: "Failed to record help feedback" });
    }
  });

  // Image Upload System for Knowledge Base Articles
  
  // Ensure upload directory exists
  const uploadDir = path.join(process.cwd(), 'uploads', 'kb');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure multer for image uploads
  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const { tenantId, articleId } = req.params;
      let uploadPath = uploadDir;
      
      if (tenantId) {
        uploadPath = path.join(uploadDir, tenantId);
      }
      if (articleId) {
        uploadPath = path.join(uploadPath, articleId);
      }
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      // Generate unique filename with original extension
      const ext = path.extname(file.originalname);
      const uniqueName = `${uuidv4()}${ext}`;
      cb(null, uniqueName);
    }
  });

  // File filter for images only
  const fileFilter = (req: any, file: any, cb: any) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'), false);
    }
  };

  const upload = multer({
    storage: multerStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
      files: 10 // Max 10 files per upload
    }
  });

  // Serve uploaded images statically
  app.use('/uploads/kb', express.static(path.join(process.cwd(), 'uploads', 'kb')));

  // POST /api/help/uploads - Upload images for KB articles (Super Admin only)
  app.post("/api/help/uploads", isAuthenticated, requireSuperAdmin, upload.array('images', 10), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedFiles = files.map(file => {
        // Calculate relative URL from upload path
        const relativePath = path.relative(path.join(process.cwd(), 'uploads', 'kb'), file.path);
        const imageUrl = `/uploads/kb/${relativePath.replace(/\\/g, '/')}`;
        
        return {
          filename: file.filename,
          originalName: file.originalname,
          url: imageUrl,
          size: file.size,
          mimetype: file.mimetype
        };
      });

      res.json({
        message: "Images uploaded successfully",
        files: uploadedFiles
      });
    } catch (error: any) {
      console.error("Error uploading images:", error);
      
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          message: "File too large. Maximum size is 5MB per image." 
        });
      }
      
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          message: "Too many files. Maximum is 10 files per upload." 
        });
      }
      
      if (error.message.includes('Invalid file type')) {
        return res.status(400).json({ 
          message: "Invalid file type. Only image files (JPEG, PNG, GIF, WebP) are allowed." 
        });
      }
      
      res.status(500).json({ message: "Failed to upload images" });
    }
  });

  // POST /api/help/uploads/:tenantId - Upload images for tenant-specific KB articles
  app.post("/api/help/uploads/:tenantId", isAuthenticated, requireTenantAccess, upload.array('images', 10), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedFiles = files.map(file => {
        const relativePath = path.relative(path.join(process.cwd(), 'uploads', 'kb'), file.path);
        const imageUrl = `/uploads/kb/${relativePath.replace(/\\/g, '/')}`;
        
        return {
          filename: file.filename,
          originalName: file.originalname,
          url: imageUrl,
          size: file.size,
          mimetype: file.mimetype
        };
      });

      res.json({
        message: "Images uploaded successfully",
        files: uploadedFiles
      });
    } catch (error: any) {
      console.error("Error uploading tenant images:", error);
      
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          message: "File too large. Maximum size is 5MB per image." 
        });
      }
      
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          message: "Too many files. Maximum is 10 files per upload." 
        });
      }
      
      if (error.message.includes('Invalid file type')) {
        return res.status(400).json({ 
          message: "Invalid file type. Only image files (JPEG, PNG, GIF, WebP) are allowed." 
        });
      }
      
      res.status(500).json({ message: "Failed to upload images" });
    }
  });

  // POST /api/help/uploads/:tenantId/:articleId - Upload images for specific article
  app.post("/api/help/uploads/:tenantId/:articleId", isAuthenticated, requireTenantAccess, upload.array('images', 10), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, articleId } = req.params;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      // Verify article exists and user has access
      const article = await storage.getKbArticleById(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      if (article.tenantId !== tenantId) {
        return res.status(400).json({ message: "Article does not belong to specified tenant" });
      }

      const uploadedFiles = files.map(file => {
        const relativePath = path.relative(path.join(process.cwd(), 'uploads', 'kb'), file.path);
        const imageUrl = `/uploads/kb/${relativePath.replace(/\\/g, '/')}`;
        
        return {
          filename: file.filename,
          originalName: file.originalname,
          url: imageUrl,
          size: file.size,
          mimetype: file.mimetype
        };
      });

      res.json({
        message: "Images uploaded successfully",
        files: uploadedFiles
      });
    } catch (error: any) {
      console.error("Error uploading article images:", error);
      
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          message: "File too large. Maximum size is 5MB per image." 
        });
      }
      
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          message: "Too many files. Maximum is 10 files per upload." 
        });
      }
      
      if (error.message.includes('Invalid file type')) {
        return res.status(400).json({ 
          message: "Invalid file type. Only image files (JPEG, PNG, GIF, WebP) are allowed." 
        });
      }
      
      res.status(500).json({ message: "Failed to upload images" });
    }
  });

  // DELETE /api/help/uploads/:path - Delete uploaded image (Super Admin only)
  app.delete("/api/help/uploads/*", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const imagePath = req.params[0]; // Get the wildcard path
      const fullPath = path.join(process.cwd(), 'uploads', 'kb', imagePath);
      
      // Security check: ensure path is within uploads directory
      const uploadsDir = path.join(process.cwd(), 'uploads', 'kb');
      const resolvedPath = path.resolve(fullPath);
      const resolvedUploadsDir = path.resolve(uploadsDir);
      
      if (!resolvedPath.startsWith(resolvedUploadsDir)) {
        return res.status(400).json({ message: "Invalid file path" });
      }
      
      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ message: "Image not found" });
      }
      
      // Delete the file
      fs.unlinkSync(fullPath);
      
      res.json({ message: "Image deleted successfully" });
    } catch (error) {
      console.error("Error deleting image:", error);
      res.status(500).json({ message: "Failed to delete image" });
    }
  });

  // Development route to seed knowledge base articles - SECURED
  app.post("/api/dev/seed-kb", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    // SECURITY: Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ message: "Not found" });
    }
    
    try {
      await storage.seedKnowledgeBaseArticles();
      res.json({ message: "Knowledge base articles seeded successfully" });
    } catch (error) {
      console.error("Error seeding KB articles:", error);
      res.status(500).json({ message: "Failed to seed knowledge base articles", error: (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
