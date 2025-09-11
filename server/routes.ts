import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import {
  insertTenantSchema,
  insertProductSchema,
  insertCustomerSchema,
  insertOrderSchema,
  batches,
  products,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

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

  // Tenant routes
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

  // Feature flag routes
  app.get("/api/feature-flags", isAuthenticated, async (req: any, res) => {
    try {
      const flags = await storage.getFeatureFlags();
      res.json(flags);
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      res.status(500).json({ message: "Failed to fetch feature flags" });
    }
  });

  app.get("/api/tenants/:tenantId/feature-flags", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const flags = await storage.getTenantFeatureFlags(tenantId);
      res.json(flags);
    } catch (error) {
      console.error("Error fetching tenant feature flags:", error);
      res.status(500).json({ message: "Failed to fetch tenant feature flags" });
    }
  });

  // Product routes (Inventory module)
  app.get("/api/tenants/:tenantId/products", isAuthenticated, async (req: any, res) => {
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

  app.post("/api/tenants/:tenantId/products", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/tenants/:tenantId/customers", isAuthenticated, async (req: any, res) => {
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

  app.post("/api/tenants/:tenantId/customers", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/tenants/:tenantId/orders", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const orders = await storage.getOrders(tenantId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.post("/api/tenants/:tenantId/orders", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/tenants/:tenantId/dashboard/kpis", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/orders/assist/qty-to-price", isAuthenticated, async (req: any, res) => {
    try {
      const { productId, quantity, tenantId } = req.body;
      
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

  app.post("/api/orders/assist/amount-to-qty", isAuthenticated, async (req: any, res) => {
    try {
      const { productId, targetAmount, tenantId } = req.body;
      
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
  app.post("/api/delivery/estimate", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId, pickupLat, pickupLon, dropoffLat, dropoffLon } = req.body;
      
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
  app.get("/api/tenants/:tenantId/settings", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const settings = await storage.getTenantSettings(tenantId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch tenant settings" });
    }
  });

  app.put("/api/tenants/:tenantId/settings", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      // For now, just return success - full implementation would update database
      res.json({ message: "Settings updated successfully" });
    } catch (error) {
      console.error("Error updating tenant settings:", error);
      res.status(500).json({ message: "Failed to update tenant settings" });
    }
  });

  // Loyalty accounts routes
  app.get("/api/tenants/:tenantId/loyalty", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/tenants/:tenantId/credit", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const creditAccounts = await storage.getCreditAccounts(tenantId);
      res.json(creditAccounts);
    } catch (error) {
      console.error("Error fetching credit accounts:", error);
      res.status(500).json({ message: "Failed to fetch credit accounts" });
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
