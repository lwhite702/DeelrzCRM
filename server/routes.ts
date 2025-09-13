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
  insertSelfDestructSchema,
  insertAuditLogSchema,
  insertPurgeOperationSchema,
  insertInactivityPolicySchema,
  insertInactivityTrackerSchema,
  insertActivityEventSchema,
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

// Owner/Super admin authorization middleware for self-destruct operations
const requireOwnerOrSuperAdmin = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user.claims.sub;
    const { tenantId } = req.params;
    
    // Get user tenants to check role for this specific tenant
    const userTenants = await storage.getUserTenants(userId);
    const userTenant = userTenants.find(ut => ut.tenantId === tenantId);
    
    if (!userTenant) {
      return res.status(403).json({ 
        message: "Access denied: No access to this tenant" 
      });
    }
    
    // Check if user is owner or super admin for this tenant
    const hasPermission = userTenant.role === "owner" || userTenant.role === "super_admin";
    
    if (!hasPermission) {
      return res.status(403).json({ 
        message: "Access denied: Owner or super admin role required for self-destruct operations" 
      });
    }
    
    next();
  } catch (error) {
    console.error("Owner/super admin authorization error:", error);
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
      // Use encrypted customer creation with dual-write support
      const customer = await storage.createCustomerEncrypted(customerData);
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

  // Self-Destruct Management Routes (Owner/Super Admin Only)
  
  // POST /api/tenants/:tenantId/self-destruct/arm - Arm content for self-destruction
  tenantRouter.post("/self-destruct/arm", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.user.claims.sub;
      
      // Validate request body with extended schema for TTL support
      const armSchema = insertSelfDestructSchema.extend({
        destructAt: z.string().datetime().optional(), // ISO 8601 datetime string
      });
      
      const { targetTable, targetId, reason, destructAt, metadata } = armSchema.parse(req.body);
      
      // Convert destructAt string to Date if provided
      const destructAtDate = destructAt ? new Date(destructAt) : undefined;
      
      // Validate target table is supported
      const supportedTables = ['customers', 'deliveries', 'orders', 'payments', 'credits', 'credit_transactions', 'kb_articles'];
      if (!supportedTables.includes(targetTable)) {
        return res.status(400).json({ 
          message: `Unsupported target table: ${targetTable}. Supported tables: ${supportedTables.join(', ')}` 
        });
      }
      
      // Validate destructAt is in the future if provided
      if (destructAtDate && destructAtDate <= new Date()) {
        return res.status(400).json({ 
          message: "destructAt must be a future timestamp" 
        });
      }
      
      const selfDestruct = await storage.armSelfDestruct({
        tenantId,
        targetTable,
        targetId,
        armedBy: userId,
        reason,
        destructAt: destructAtDate,
        metadata,
      });
      
      res.json({
        message: "Content armed for self-destruction successfully",
        selfDestruct,
      });
    } catch (error: any) {
      console.error("Error arming self-destruct:", error);
      
      if (error.message.includes('not enabled')) {
        return res.status(403).json({ message: error.message });
      }
      
      if (error.message.includes('already armed')) {
        return res.status(409).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to arm content for self-destruction" });
    }
  });
  
  // POST /api/tenants/:tenantId/self-destruct/disarm - Disarm content self-destruction
  tenantRouter.post("/self-destruct/disarm", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.user.claims.sub;
      
      const { id, reason } = z.object({
        id: z.string().uuid(),
        reason: z.string().optional(),
      }).parse(req.body);
      
      const selfDestruct = await storage.disarmSelfDestruct(id, tenantId, userId, reason);
      
      res.json({
        message: "Content disarmed successfully",
        selfDestruct,
      });
    } catch (error: any) {
      console.error("Error disarming self-destruct:", error);
      
      if (error.message.includes('not enabled')) {
        return res.status(403).json({ message: error.message });
      }
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to disarm content" });
    }
  });
  
  // POST /api/tenants/:tenantId/self-destruct/destroy - Immediately destroy content
  tenantRouter.post("/self-destruct/destroy", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.user.claims.sub;
      
      const { id, reason } = z.object({
        id: z.string().uuid(),
        reason: z.string().optional(),
      }).parse(req.body);
      
      await storage.destroyNow(id, tenantId, userId, reason);
      
      res.json({
        message: "Content destroyed successfully",
      });
    } catch (error: any) {
      console.error("Error destroying content:", error);
      
      if (error.message.includes('not enabled')) {
        return res.status(403).json({ message: error.message });
      }
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to destroy content" });
    }
  });
  
  // GET /api/tenants/:tenantId/self-destruct/list - List armed content (admin only)
  tenantRouter.get("/self-destruct/list", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { status, targetTable } = req.query;
      
      const filters: { status?: string; targetTable?: string } = {};
      
      if (status && typeof status === 'string') {
        filters.status = status;
      }
      
      if (targetTable && typeof targetTable === 'string') {
        filters.targetTable = targetTable;
      }
      
      const selfDestructs = await storage.getSelfDestructs(tenantId, filters);
      
      res.json(selfDestructs);
    } catch (error: any) {
      console.error("Error listing self-destructs:", error);
      res.status(500).json({ message: "Failed to list self-destructs" });
    }
  });
  
  // GET /api/tenants/:tenantId/audit-logs - Get audit logs (admin only)
  tenantRouter.get("/audit-logs", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { targetTable, targetId, action } = req.query;
      
      const filters: { targetTable?: string; targetId?: string; action?: string } = {};
      
      if (targetTable && typeof targetTable === 'string') {
        filters.targetTable = targetTable;
      }
      
      if (targetId && typeof targetId === 'string') {
        filters.targetId = targetId;
      }
      
      if (action && typeof action === 'string') {
        filters.action = action;
      }
      
      const auditLogs = await storage.getAuditLogs(tenantId, filters);
      
      res.json(auditLogs);
    } catch (error: any) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
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

  // =============================================
  // DANGER PURGE OPERATIONS - EXTREMELY SENSITIVE
  // =============================================

  // Feature flag check middleware for purge operations
  const requirePurgeFeatureFlag = async (req: any, res: any, next: any) => {
    try {
      const userId = req.user.claims.sub;
      let targetTenantId: string | null = null;
      
      // Determine target tenant based on route
      const path = req.route?.path;
      const { id } = req.params;
      
      if (path?.includes('/:id/') && id) {
        // For operations on existing purge operations, look up the target tenant
        const operations = await storage.getPurgeOperations({ tenantId: undefined });
        const purgeOp = operations.find(op => op.id === id);
        
        if (!purgeOp) {
          return res.status(404).json({ message: "Purge operation not found" });
        }
        
        targetTenantId = purgeOp.tenantId;
      } else if (path?.includes('/request')) {
        // For new purge requests, get tenant from request body
        targetTenantId = req.body?.tenantId;
        
        if (!targetTenantId) {
          return res.status(400).json({ 
            message: "Target tenant ID is required for purge operations" 
          });
        }
      } else if (path?.includes('/status')) {
        // For status endpoints, super admin access is sufficient (no specific tenant check)
        return next();
      }
      
      if (!targetTenantId) {
        return res.status(400).json({ 
          message: "Unable to determine target tenant for purge operation" 
        });
      }
      
      // CRITICAL SECURITY FIX: Check feature flags for the TARGET tenant, not requester's tenant
      const featureFlags = await storage.getTenantFeatureFlags(targetTenantId);
      
      if (!featureFlags['danger_purge']) {
        console.error(`🚨 SECURITY: Attempted purge on tenant ${targetTenantId} with disabled danger_purge feature by user ${userId}`);
        return res.status(403).json({ 
          message: "CRITICAL: Danger purge feature is not enabled for this tenant. Contact system administrator." 
        });
      }

      // CRITICAL SECURITY: Enforce export acknowledgment for execute-now operations
      if (path?.includes('/execute-now') && id) {
        const operations = await storage.getPurgeOperations({ tenantId: undefined });
        const purgeOp = operations.find(op => op.id === id);
        
        if (!purgeOp?.exportAckedAt) {
          console.error(`🚨 SECURITY: Attempted immediate execution without export acknowledgment for purge ${id} by user ${userId}`);
          return res.status(403).json({ 
            message: "CRITICAL: Export must be acknowledged before immediate execution. This is a mandatory safety step." 
          });
        }

        // Store purge operation for downstream validation
        req.purgeOperation = purgeOp;
      }
      
      // Store target tenant ID for use in subsequent route handlers
      req.targetTenantId = targetTenantId;
      
      next();
    } catch (error) {
      console.error("Feature flag check error:", error);
      res.status(500).json({ message: "Feature flag check failed" });
    }
  };

  // Helper to get client IP and User Agent
  const getClientInfo = (req: any) => ({
    ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  });

  // Enhanced MFA validation for purge operations
  const validatePurgeMFA = async (req: any, res: any, next: any) => {
    try {
      const userId = req.user.claims.sub;
      const { otpToken, finalConfirmation, tenantNameConfirmation } = req.body;
      const { ipAddress, userAgent } = getClientInfo(req);
      
      // 1. Verify re-authentication is recent (within 5 minutes)
      const authTime = req.user.claims?.auth_time || req.user.claims?.iat;
      const now = Math.floor(Date.now() / 1000);
      const AUTH_TIMEOUT_SECONDS = 5 * 60; // 5 minutes
      
      if (!authTime || (now - authTime) > AUTH_TIMEOUT_SECONDS) {
        console.error(`🚨 SECURITY: Re-authentication required for user ${userId} from ${ipAddress}`);
        return res.status(401).json({ 
          message: "Recent authentication required. Please re-authenticate within the last 5 minutes.",
          authTimeRemaining: 0
        });
      }

      // 2. Validate OTP Token (simplified for demo - in production use proper TOTP/SMS)
      if (!otpToken || otpToken.length !== 6 || !/^\d{6}$/.test(otpToken)) {
        return res.status(400).json({ 
          message: "Valid 6-digit OTP required" 
        });
      }
      
      // In production, validate against generated TOTP/SMS code
      const validOTP = process.env.NODE_ENV === 'production' ? 
        await validateTOTP(userId, otpToken) : // Replace with real TOTP validation
        otpToken === '123456'; // Demo validation
        
      if (!validOTP) {
        console.error(`🚨 SECURITY: Invalid OTP attempt by user ${userId} from ${ipAddress}`);
        return res.status(401).json({ 
          message: "Invalid OTP code" 
        });
      }

      // 3. Validate typed confirmation phrases
      const requiredConfirmations = {
        schedule: "DESTROY_ALL_DATA",
        executeNow: "IMMEDIATE_DESTRUCTION_CONFIRMED"
      };
      
      const operationType = req.route?.path?.includes('/execute-now') ? 'executeNow' : 'schedule';
      const expectedConfirmation = requiredConfirmations[operationType];
      
      if (finalConfirmation !== expectedConfirmation) {
        return res.status(400).json({ 
          message: `You must type '${expectedConfirmation}' exactly to confirm` 
        });
      }

      // 4. For operations with tenant names, verify tenant name confirmation
      if (tenantNameConfirmation && req.targetTenantId) {
        const tenant = await storage.getTenant(req.targetTenantId);
        if (!tenant || tenant.name !== tenantNameConfirmation) {
          console.error(`🚨 SECURITY: Incorrect tenant name confirmation for ${req.targetTenantId} by user ${userId}`);
          return res.status(400).json({ 
            message: "SECURITY: Tenant name confirmation failed. This is a safety check." 
          });
        }
      }

      // 5. Log the successful MFA validation
      console.warn(`🔐 MFA VALIDATION PASSED for user ${userId} from ${ipAddress} for operation ${operationType}`);
      
      // Store validation timestamp for audit purposes
      req.mfaValidatedAt = new Date();
      req.mfaDetails = {
        authTime,
        ipAddress,
        userAgent,
        operationType
      };
      
      next();
    } catch (error) {
      console.error("MFA validation error:", error);
      res.status(500).json({ message: "MFA validation failed" });
    }
  };

  // Fake TOTP validation for demo (replace with real implementation in production)
  const validateTOTP = async (userId: string, token: string): Promise<boolean> => {
    // In production, implement proper TOTP validation using libraries like speakeasy
    // This would validate against the user's TOTP secret stored securely
    return token === '123456'; // Simplified for demo
  };

  // CRITICAL SECURITY: Add tenant access verification middleware for purge operations
  const requirePurgeTenantAccess = async (req: any, res: any, next: any) => {
    try {
      const userId = req.user.claims.sub;
      const { ipAddress, userAgent } = getClientInfo(req);
      
      // Get target tenant ID from route or request body
      let targetTenantId = req.targetTenantId || req.body?.tenantId;
      
      if (!targetTenantId && req.params?.id) {
        // For purge operations, look up the target tenant
        const operations = await storage.getPurgeOperations({ tenantId: undefined });
        const purgeOp = operations.find(op => op.id === req.params.id);
        targetTenantId = purgeOp?.tenantId;
      }
      
      if (!targetTenantId) {
        console.error(`🚨 SECURITY: Unable to determine target tenant for purge operation by user ${userId} from ${ipAddress}`);
        return res.status(400).json({ 
          message: "SECURITY: Cannot determine target tenant for purge operation" 
        });
      }
      
      // Verify user has access to target tenant (super admin role with tenant membership)
      const userTenants = await storage.getUserTenants(userId);
      const hasAccess = userTenants.some(ut => ut.tenantId === targetTenantId && 
        (ut.role === "super_admin" || ut.role === "owner"));
      
      if (!hasAccess) {
        console.error(`🚨 SECURITY: Purge access denied - User ${userId} from ${ipAddress} lacks super_admin/owner access to tenant ${targetTenantId}`);
        
        // Create audit log for failed authorization
        await storage.createAuditLog({
          tenantId: targetTenantId,
          targetTable: 'purge_operations',
          targetId: req.params?.id || 'new_request',
          action: 'request_purge',
          actor: userId,
          actorType: 'user',
          reason: 'SECURITY_VIOLATION: Insufficient tenant access for purge operation',
          metadata: {
            ipAddress,
            userAgent,
            failureReason: 'No super_admin/owner role for target tenant',
            attemptedRoute: req.route?.path
          }
        });
        
        return res.status(403).json({ 
          message: "CRITICAL: Access denied - You must be a super admin or owner of the target tenant to perform purge operations" 
        });
      }
      
      // Store verification for downstream middleware
      req.tenantAccessVerified = true;
      req.verifiedTenantId = targetTenantId;
      
      console.warn(`🔐 PURGE TENANT ACCESS VERIFIED: User ${userId} has super_admin/owner access to tenant ${targetTenantId}`);
      next();
    } catch (error) {
      console.error("Purge tenant access verification error:", error);
      res.status(500).json({ message: "Tenant access verification failed" });
    }
  };

  // POST /api/admin/purge/request - Request a purge operation (Super Admin only)
  app.post("/api/admin/purge/request", isAuthenticated, requireSuperAdmin, requirePurgeTenantAccess, requirePurgeFeatureFlag, validatePurgeMFA, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ipAddress, userAgent } = getClientInfo(req);
      
      const requestSchema = z.object({
        tenantId: z.string().uuid(),
        tenantName: z.string().min(1, "Tenant name is required for confirmation"),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
        confirmDestruction: z.literal(true, {
          errorMap: () => ({ message: "You must confirm that this will permanently destroy all data" })
        })
      });
      
      const validatedData = requestSchema.parse(req.body);
      
      // Verify tenant exists and name matches (case-sensitive security check)
      const tenant = await storage.getTenant(validatedData.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      if (tenant.name !== validatedData.tenantName) {
        return res.status(400).json({ 
          message: "SECURITY: Tenant name does not match exactly. This is a safety check." 
        });
      }
      
      // Create the purge operation
      const purgeOperation = await storage.requestPurge({
        tenantId: validatedData.tenantId,
        tenantName: validatedData.tenantName,
        requestedBy: userId,
        reason: validatedData.reason,
        ipAddress,
        userAgent,
      });
      
      console.warn(`🚨 PURGE REQUESTED for tenant ${tenant.name} (${tenant.id}) by user ${userId}`);
      
      res.status(201).json({
        message: "Purge operation requested successfully. Export data before proceeding!",
        purgeOperation: {
          id: purgeOperation.id,
          tenantId: purgeOperation.tenantId,
          tenantName: purgeOperation.tenantName,
          status: purgeOperation.status,
          requestedAt: purgeOperation.requestedAt,
          reason: purgeOperation.reason
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error requesting purge:", error);
      res.status(500).json({ message: "Failed to request purge operation" });
    }
  });

  // POST /api/admin/purge/:id/export-ack - Acknowledge export completion
  app.post("/api/admin/purge/:id/export-ack", isAuthenticated, requireSuperAdmin, requirePurgeTenantAccess, requirePurgeFeatureFlag, validatePurgeMFA, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ackSchema = z.object({
        exportConfirmed: z.literal(true, {
          errorMap: () => ({ message: "You must confirm that data export is complete" })
        })
      });
      
      ackSchema.parse(req.body);
      
      // Get purge operation to verify tenant access
      const operations = await storage.getPurgeOperations({ tenantId: undefined });
      const purgeOp = operations.find(op => op.id === id);
      
      if (!purgeOp) {
        return res.status(404).json({ message: "Purge operation not found" });
      }
      
      const purgeOperation = await storage.ackExport(id, purgeOp.tenantId);
      
      console.warn(`🚨 EXPORT ACKNOWLEDGED for purge ${id} by user ${userId}`);
      
      res.json({
        message: "Export acknowledged. Purge can now be scheduled.",
        purgeOperation: {
          id: purgeOperation.id,
          status: purgeOperation.status,
          exportAckedAt: purgeOperation.exportAckedAt
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error acknowledging export:", error);
      res.status(500).json({ message: "Failed to acknowledge export" });
    }
  });

  // POST /api/admin/purge/:id/schedule - Schedule purge for execution
  app.post("/api/admin/purge/:id/schedule", isAuthenticated, requireSuperAdmin, requirePurgeTenantAccess, requirePurgeFeatureFlag, validatePurgeMFA, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const scheduleSchema = z.object({
        scheduledAt: z.string().datetime(),
        otpToken: z.string().length(6, "OTP must be exactly 6 digits"),
        finalConfirmation: z.literal("DESTROY_ALL_DATA", {
          errorMap: () => ({ message: "You must type 'DESTROY_ALL_DATA' to confirm" })
        })
      });
      
      const validatedData = scheduleSchema.parse(req.body);
      const scheduledDate = new Date(validatedData.scheduledAt);
      
      // Validate scheduled time is in the future
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ 
          message: "Scheduled time must be in the future" 
        });
      }
      
      // Validate scheduled time is not too far in the future (max 7 days)
      const maxScheduleTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (scheduledDate > maxScheduleTime) {
        return res.status(400).json({ 
          message: "Cannot schedule more than 7 days in advance" 
        });
      }
      
      // Use proper confirmation token from MFA validation
      const confirmationToken = req.mfaValidatedAt?.getTime().toString() || validatedData.otpToken;
      
      // Get purge operation to verify tenant access
      const operations = await storage.getPurgeOperations({ tenantId: undefined });
      const purgeOp = operations.find(op => op.id === id);
      
      if (!purgeOp) {
        return res.status(404).json({ message: "Purge operation not found" });
      }
      
      const purgeOperation = await storage.schedulePurge(id, purgeOp.tenantId, scheduledDate, confirmationToken);
      
      console.error(`🚨 PURGE SCHEDULED for ${scheduledDate.toISOString()} - Operation ${id} by user ${userId}`);
      
      res.json({
        message: `CRITICAL: Purge scheduled for ${scheduledDate.toISOString()}. Can be canceled until execution.`,
        purgeOperation: {
          id: purgeOperation.id,
          status: purgeOperation.status,
          scheduledAt: purgeOperation.scheduledAt
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error scheduling purge:", error);
      res.status(500).json({ message: "Failed to schedule purge" });
    }
  });

  // POST /api/admin/purge/:id/cancel - Cancel a pending purge
  app.post("/api/admin/purge/:id/cancel", isAuthenticated, requireSuperAdmin, requirePurgeTenantAccess, requirePurgeFeatureFlag, validatePurgeMFA, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const cancelSchema = z.object({
        reason: z.string().min(5, "Cancellation reason must be at least 5 characters")
      });
      
      const validatedData = cancelSchema.parse(req.body);
      
      // Get purge operation to verify tenant access
      const operations = await storage.getPurgeOperations({ tenantId: undefined });
      const purgeOp = operations.find(op => op.id === id);
      
      if (!purgeOp) {
        return res.status(404).json({ message: "Purge operation not found" });
      }
      
      const purgeOperation = await storage.cancelPurge(id, purgeOp.tenantId, userId, validatedData.reason);
      
      console.warn(`✅ PURGE CANCELED - Operation ${id} by user ${userId}: ${validatedData.reason}`);
      
      res.json({
        message: "Purge operation canceled successfully",
        purgeOperation: {
          id: purgeOperation.id,
          status: purgeOperation.status,
          canceledAt: purgeOperation.canceledAt,
          canceledBy: purgeOperation.canceledBy
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error canceling purge:", error);
      res.status(500).json({ message: "Failed to cancel purge operation" });
    }
  });

  // GET /api/admin/purge/status - Get all purge operations
  app.get("/api/admin/purge/status", isAuthenticated, requireSuperAdmin, requirePurgeFeatureFlag, async (req: any, res) => {
    try {
      const { tenantId, status } = req.query;
      
      const filters: { tenantId?: string; status?: string } = {};
      
      if (tenantId && typeof tenantId === 'string') {
        filters.tenantId = tenantId;
      }
      
      if (status && typeof status === 'string') {
        filters.status = status;
      }
      
      const purgeOperations = await storage.getPurgeOperations(filters);
      
      res.json({
        purgeOperations: purgeOperations.map(op => ({
          id: op.id,
          tenantId: op.tenantId,
          tenantName: op.tenantName,
          status: op.status,
          requestedBy: op.requestedBy,
          requestedByName: op.requestedByName,
          requestedAt: op.requestedAt,
          exportAckedAt: op.exportAckedAt,
          scheduledAt: op.scheduledAt,
          startedAt: op.startedAt,
          completedAt: op.completedAt,
          canceledAt: op.canceledAt,
          canceledBy: op.canceledBy,
          canceledByName: op.canceledByName,
          failedAt: op.failedAt,
          reason: op.reason,
          errorMessage: op.errorMessage,
          recordsDestroyed: op.recordsDestroyed,
          tablesDestroyed: op.tablesDestroyed
        }))
      });
    } catch (error: any) {
      console.error("Error getting purge status:", error);
      res.status(500).json({ message: "Failed to get purge status" });
    }
  });

  // POST /api/admin/purge/:id/execute-now - EXTREMELY DANGEROUS: Execute purge immediately
  app.post("/api/admin/purge/:id/execute-now", isAuthenticated, requireSuperAdmin, requirePurgeTenantAccess, requirePurgeFeatureFlag, validatePurgeMFA, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { ipAddress, userAgent } = getClientInfo(req);
      
      const executeSchema = z.object({
        emergencyBypass: z.literal(true),
        otpToken: z.string().length(6, "OTP must be exactly 6 digits"),
        holdConfirmation: z.literal("IMMEDIATE_DESTRUCTION_CONFIRMED", {
          errorMap: () => ({ message: "You must type 'IMMEDIATE_DESTRUCTION_CONFIRMED' to execute" })
        }),
        tenantNameConfirmation: z.string().min(1, "Must re-confirm tenant name")
      });
      
      const validatedData = executeSchema.parse(req.body);
      
      // Get purge operation to verify everything
      const operations = await storage.getPurgeOperations({ tenantId: undefined });
      const purgeOp = operations.find(op => op.id === id);
      
      if (!purgeOp) {
        return res.status(404).json({ message: "Purge operation not found" });
      }
      
      // Verify tenant name again for safety
      if (purgeOp.tenantName !== validatedData.tenantNameConfirmation) {
        return res.status(400).json({ 
          message: "SECURITY: Tenant name confirmation failed" 
        });
      }
      
      // Start the purge operation
      await storage.startPurge(id, purgeOp.tenantId);
      
      console.error(`💥 IMMEDIATE PURGE EXECUTING - Operation ${id} for tenant ${purgeOp.tenantName} by user ${userId}`);
      console.error(`💥 IP: ${ipAddress}, User Agent: ${userAgent}`);
      
      try {
        // Execute the purge
        const result = await storage.purgeTenantNow(purgeOp.tenantId, id);
        
        // Mark as completed
        await storage.completePurge(id, purgeOp.tenantId, result.recordsDestroyed, result.tablesDestroyed);
        
        console.error(`💥 PURGE COMPLETED: ${result.recordsDestroyed} records destroyed across ${result.tablesDestroyed} tables`);
        
        res.json({
          message: "⚠️ TENANT DATA PERMANENTLY DESTROYED ⚠️",
          result: {
            tenantId: purgeOp.tenantId,
            tenantName: purgeOp.tenantName,
            recordsDestroyed: result.recordsDestroyed,
            tablesDestroyed: result.tablesDestroyed,
            completedAt: new Date().toISOString()
          }
        });
      } catch (executionError: any) {
        console.error("Purge execution failed:", executionError);
        
        // Mark as failed
        await storage.failPurge(id, purgeOp.tenantId, executionError.message);
        
        res.status(500).json({ 
          message: "Purge execution failed", 
          error: executionError.message 
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error in immediate purge execution:", error);
      res.status(500).json({ message: "Failed to execute purge" });
    }
  });

  // ===== INACTIVITY AUTO-DELETION POLICY SYSTEM API ROUTES =====

  // Feature flag middleware for inactivity system
  const requireInactivityFeatureFlag = async (req: any, res: any, next: any) => {
    try {
      const globalFlags = await storage.getFeatureFlags();
      const inactivityFlag = globalFlags.find(f => f.key === 'inactivity_auto_delete');
      
      // Check if globally enabled first
      if (inactivityFlag?.defaultEnabled) {
        return next();
      }
      
      // If not globally enabled, check if any tenant has it enabled via overrides
      // This allows super admins to manage policies for tenants that have enabled it
      const { tenantId } = req.query;
      if (tenantId && typeof tenantId === 'string') {
        const tenantFlags = await storage.getTenantFeatureFlags(tenantId);
        if (tenantFlags.inactivity_auto_delete) {
          return next();
        }
      }
      
      // Check if user is super admin - they should be able to view/manage all policies
      const userId = req.user.claims.sub;
      const userTenants = await storage.getUserTenants(userId);
      const isSuperAdmin = userTenants.some(ut => ut.role === "super_admin");
      
      if (isSuperAdmin) {
        return next(); // Super admins can always manage inactivity policies
      }
      
      return res.status(403).json({ 
        message: "Access denied: Inactivity auto-deletion feature is not enabled globally or for the specified tenant" 
      });
      
    } catch (error) {
      console.error("Error checking inactivity feature flag:", error);
      res.status(500).json({ message: "Failed to check feature access" });
    }
  };

  // GET /api/admin/inactivity/policies - List all inactivity policies
  app.get("/api/admin/inactivity/policies", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const { tenantId } = req.query;
      
      const policies = await storage.getInactivityPolicies(
        tenantId && typeof tenantId === 'string' ? tenantId : undefined
      );
      
      res.json({
        policies: policies.map(policy => ({
          id: policy.id,
          tenantId: policy.tenantId,
          target: policy.target,
          inactivityDays: policy.inactivityDays,
          action: policy.action,
          gracePeriodDays: policy.gracePeriodDays,
          isEnabled: policy.isEnabled,
          createdAt: policy.createdAt,
          updatedAt: policy.updatedAt,
          createdBy: policy.createdBy,
          metadata: policy.metadata,
        })),
        totalCount: policies.length,
      });
    } catch (error) {
      console.error("Error fetching inactivity policies:", error);
      res.status(500).json({ message: "Failed to fetch inactivity policies" });
    }
  });

  // POST /api/admin/inactivity/policies - Create inactivity policy
  app.post("/api/admin/inactivity/policies", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const policyData = insertInactivityPolicySchema.parse({
        ...req.body,
        createdBy: userId,
      });

      const policy = await storage.createInactivityPolicy(policyData);
      
      // Audit log
      await storage.createAuditLog({
        tenantId: policy.tenantId || "global",
        targetTable: "inactivity_policies",
        targetId: policy.id,
        action: "create",
        actor: userId,
        before: null,
        after: {
          target: policy.target,
          inactivityDays: policy.inactivityDays,
          action: policy.action,
          gracePeriodDays: policy.gracePeriodDays,
          isEnabled: policy.isEnabled,
        },
        metadata: { policyType: "inactivity" },
      });

      res.status(201).json({
        message: "Inactivity policy created successfully",
        policy,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid policy data",
          errors: error.errors,
        });
      }
      console.error("Error creating inactivity policy:", error);
      res.status(500).json({ message: "Failed to create inactivity policy" });
    }
  });

  // PUT /api/admin/inactivity/policies/:id - Update inactivity policy
  app.put("/api/admin/inactivity/policies/:id", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Get existing policy for audit logging
      const existingPolicies = await storage.getInactivityPolicies();
      const existingPolicy = existingPolicies.find(p => p.id === id);
      
      if (!existingPolicy) {
        return res.status(404).json({ message: "Inactivity policy not found" });
      }

      const updateData = insertInactivityPolicySchema.partial().parse(req.body);
      const policy = await storage.updateInactivityPolicy(id, updateData);

      // Audit log
      await storage.createAuditLog({
        tenantId: policy.tenantId || "global",
        targetTable: "inactivity_policies",
        targetId: policy.id,
        action: "update",
        actor: userId,
        before: {
          target: existingPolicy.target,
          inactivityDays: existingPolicy.inactivityDays,
          action: existingPolicy.action,
          gracePeriodDays: existingPolicy.gracePeriodDays,
          isEnabled: existingPolicy.isEnabled,
        },
        after: {
          target: policy.target,
          inactivityDays: policy.inactivityDays,
          action: policy.action,
          gracePeriodDays: policy.gracePeriodDays,
          isEnabled: policy.isEnabled,
        },
        metadata: { policyType: "inactivity" },
      });

      res.json({
        message: "Inactivity policy updated successfully",
        policy,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid policy data",
          errors: error.errors,
        });
      }
      console.error("Error updating inactivity policy:", error);
      res.status(500).json({ message: "Failed to update inactivity policy" });
    }
  });

  // DELETE /api/admin/inactivity/policies/:id - Delete inactivity policy
  app.delete("/api/admin/inactivity/policies/:id", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Get existing policy for audit logging
      const existingPolicies = await storage.getInactivityPolicies();
      const existingPolicy = existingPolicies.find(p => p.id === id);
      
      if (!existingPolicy) {
        return res.status(404).json({ message: "Inactivity policy not found" });
      }

      await storage.deleteInactivityPolicy(id);

      // Audit log
      await storage.createAuditLog({
        tenantId: existingPolicy.tenantId || "global",
        targetTable: "inactivity_policies",
        targetId: id,
        action: "delete",
        actor: userId,
        before: {
          target: existingPolicy.target,
          inactivityDays: existingPolicy.inactivityDays,
          action: existingPolicy.action,
          gracePeriodDays: existingPolicy.gracePeriodDays,
          isEnabled: existingPolicy.isEnabled,
        },
        after: null,
        metadata: { policyType: "inactivity" },
      });

      res.json({ message: "Inactivity policy deleted successfully" });
    } catch (error) {
      console.error("Error deleting inactivity policy:", error);
      res.status(500).json({ message: "Failed to delete inactivity policy" });
    }
  });

  // GET /api/tenants/:tenantId/inactivity/trackers - Get inactivity trackers for tenant
  tenantRouter.get("/inactivity/trackers", async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { stage, targetTable, overdue } = req.query;
      
      const filters: any = {};
      if (stage && typeof stage === 'string') filters.stage = stage;
      if (targetTable && typeof targetTable === 'string') filters.targetTable = targetTable;
      if (overdue === 'true') filters.overdue = true;

      const trackers = await storage.getInactivityTrackers(tenantId, filters);
      
      res.json({
        trackers: trackers.map(tracker => ({
          id: tracker.id,
          targetTable: tracker.targetTable,
          targetId: tracker.targetId,
          stage: tracker.stage,
          lastActivity: tracker.lastActivity,
          warnedAt: tracker.warnedAt,
          armedAt: tracker.armedAt,
          snoozedUntil: tracker.snoozedUntil,
          nextCheck: tracker.nextCheck,
          createdAt: tracker.createdAt,
          updatedAt: tracker.updatedAt,
          metadata: tracker.metadata,
        })),
        totalCount: trackers.length,
      });
    } catch (error) {
      console.error("Error fetching inactivity trackers:", error);
      res.status(500).json({ message: "Failed to fetch inactivity trackers" });
    }
  });

  // POST /api/tenants/:tenantId/inactivity/trackers/:trackerId/restore - Restore tracker
  tenantRouter.post("/inactivity/trackers/:trackerId/restore", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId, trackerId } = req.params;
      const userId = req.user.claims.sub;

      const tracker = await storage.restoreInactivityTracker(trackerId, tenantId, userId);

      res.json({
        message: "Item restored from inactivity deletion successfully",
        tracker: {
          id: tracker.id,
          targetTable: tracker.targetTable,
          targetId: tracker.targetId,
          stage: tracker.stage,
          lastActivity: tracker.lastActivity,
          updatedAt: tracker.updatedAt,
        },
      });
    } catch (error: any) {
      if (error.message === "Inactivity tracker not found") {
        return res.status(404).json({ message: "Tracker not found" });
      }
      console.error("Error restoring inactivity tracker:", error);
      res.status(500).json({ message: "Failed to restore item" });
    }
  });

  // POST /api/tenants/:tenantId/inactivity/trackers/:trackerId/snooze - Snooze tracker
  tenantRouter.post("/inactivity/trackers/:trackerId/snooze", requireOwnerOrSuperAdmin, async (req: any, res) => {
    try {
      const { tenantId, trackerId } = req.params;
      const userId = req.user.claims.sub;
      
      const snoozeSchema = z.object({
        snoozeDays: z.number().min(1).max(90), // 1 to 90 days
      });

      const { snoozeDays } = snoozeSchema.parse(req.body);

      const tracker = await storage.snoozeInactivityTracker(trackerId, tenantId, snoozeDays, userId);

      res.json({
        message: `Item snoozed for ${snoozeDays} days`,
        tracker: {
          id: tracker.id,
          targetTable: tracker.targetTable,
          targetId: tracker.targetId,
          stage: tracker.stage,
          snoozedUntil: tracker.snoozedUntil,
          nextCheck: tracker.nextCheck,
          updatedAt: tracker.updatedAt,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid snooze data",
          errors: error.errors,
        });
      }
      if (error.message === "Inactivity tracker not found") {
        return res.status(404).json({ message: "Tracker not found" });
      }
      console.error("Error snoozing inactivity tracker:", error);
      res.status(500).json({ message: "Failed to snooze item" });
    }
  });

  // GET /api/admin/inactivity/monitor - Monitor inactivity system across all tenants
  app.get("/api/admin/inactivity/monitor", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const { stage, tenantId } = req.query;
      
      // Get summary statistics
      let warnedCount = 0;
      let armedCount = 0;
      let deletedCount = 0;
      const tenantSummaries: any[] = [];

      // Get all active tenants
      const [activeTenants] = await db.select({ 
        id: tenants.id, 
        name: tenants.name 
      }).from(tenants).where(eq(tenants.status, "active"));

      for (const tenant of [activeTenants].flat()) {
        if (tenantId && tenant.id !== tenantId) continue;

        try {
          const allTrackers = await storage.getInactivityTrackers(tenant.id);
          const warnedTrackers = allTrackers.filter(t => t.stage === "warned");
          const armedTrackers = allTrackers.filter(t => t.stage === "armed");
          const deletedTrackers = allTrackers.filter(t => t.stage === "deleted");

          warnedCount += warnedTrackers.length;
          armedCount += armedTrackers.length;
          deletedCount += deletedTrackers.length;

          tenantSummaries.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            warnedCount: warnedTrackers.length,
            armedCount: armedTrackers.length,
            deletedCount: deletedTrackers.length,
            totalTrackers: allTrackers.length,
          });
        } catch (tenantError) {
          console.error(`Error getting trackers for tenant ${tenant.name}:`, tenantError);
        }
      }

      res.json({
        summary: {
          totalWarned: warnedCount,
          totalArmed: armedCount,
          totalDeleted: deletedCount,
          totalTenants: tenantSummaries.length,
        },
        tenantBreakdown: tenantSummaries,
      });
    } catch (error) {
      console.error("Error monitoring inactivity system:", error);
      res.status(500).json({ message: "Failed to monitor inactivity system" });
    }
  });

  // POST /api/admin/inactivity/force-run - Force run inactivity enforcer (for testing)
  app.post("/api/admin/inactivity/force-run", isAuthenticated, requireSuperAdmin, requireInactivityFeatureFlag, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.body;

      console.log(`Manual inactivity enforcement triggered by user ${userId}`);

      // Trigger activity aggregation for specific tenant or all
      if (tenantId) {
        await storage.aggregateActivityEvents(tenantId);
      } else {
        const [activeTenants] = await db.select({ id: tenants.id })
          .from(tenants).where(eq(tenants.status, "active"));
        
        for (const tenant of [activeTenants].flat()) {
          await storage.aggregateActivityEvents(tenant.id);
        }
      }

      // Audit log
      await storage.createAuditLog({
        tenantId: tenantId || "global",
        targetTable: "inactivity_policies",
        targetId: "system",
        action: "inactivity_warn", // Using existing enum value
        actor: userId,
        before: null,
        after: { forceRun: true, targetTenant: tenantId },
        metadata: { actionType: "manual_aggregation" },
      });

      res.json({
        message: "Activity aggregation completed successfully",
        targetTenant: tenantId || "all",
        triggeredBy: userId,
      });
    } catch (error) {
      console.error("Error in manual inactivity enforcement:", error);
      res.status(500).json({ message: "Failed to run inactivity enforcement" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
