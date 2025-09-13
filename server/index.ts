import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();

// Trust proxy for accurate client IPs
app.set('trust proxy', 1);

// Security middleware - split dev vs prod CSP
const isProduction = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["https://js.stripe.com"]
    }
  } : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://replit.com",
        "https://*.replit.com",
        "https://*.replit.dev",
        "https://js.stripe.com",
        "data:",
        "blob:"
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'", "https://js.stripe.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// CORS configuration
const allowedOrigins = (() => {
  const origins: (string | RegExp)[] = ['http://localhost:5173']; // Always allow local dev
  
  // Add current Replit domain - try multiple patterns
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    // Current format
    origins.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`);
    // Legacy format (just in case)
    origins.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }
  
  // Add any custom domains from environment
  if (process.env.REPLIT_DOMAINS) {
    const replitDomains = process.env.REPLIT_DOMAINS.split(',').map(domain => domain.trim());
    origins.push(...replitDomains);
  }
  
  // Add current hostname if we can detect it
  const currentHost = process.env.REPLIT_URL || process.env.REPL_URL;
  if (currentHost) {
    origins.push(currentHost);
  }
  
  // In development, be more permissive
  if (!isProduction) {
    origins.push('http://localhost:3000', 'http://localhost:5000');
    origins.push('http://127.0.0.1:5000', 'https://127.0.0.1:5000');
    origins.push('http://127.0.0.1:3000', 'https://127.0.0.1:3000');
    // Allow any replit.dev domain in development
    origins.push(/https:\/\/.*\.replit\.dev/);
  }
  
  return origins;
})();

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed origin
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // In development, log the blocked origin for debugging
      if (!isProduction) {
        console.log(`CORS blocked origin: ${origin}`);
        console.log('Allowed origins:', allowedOrigins);
        // Be more permissive in development
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit auth routes to 50 requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);

// Request ID middleware
app.use((req: any, res: Response, next: NextFunction) => {
  req.requestId = nanoid();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Morgan logging for development
if (!isProduction) {
  app.use(morgan('dev'));
}

// Beta Security Middleware
// Robot blocking headers - applied globally to prevent indexing
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.BETA_NOINDEX === 'true') {
    res.setHeader('X-Robots-Tag', 'noindex,nofollow,noarchive,nosnippet,noimageindex');
  }
  next();
});

// Robots.txt route when BETA_NOINDEX is enabled
if (process.env.BETA_NOINDEX === 'true') {
  app.get('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain');
    res.send('User-agent: *\nDisallow: /');
  });
}

// Optional Basic Auth for beta access
const basicAuth = (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for specific routes if needed (health checks, etc.)
  if (req.path === '/api/health') {
    return next();
  }

  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="DeelRxCRM Beta Access"');
    return res.status(401).json({ message: 'Authentication required for beta access' });
  }

  const credentials = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');
  
  const validUser = process.env.BETA_USER || 'beta';
  const validPass = process.env.BETA_PASS || 'access';

  if (username !== validUser || password !== validPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="DeelRxCRM Beta Access"');
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  next();
};

// Apply basic auth if enabled
if (process.env.BETA_BASIC_AUTH === '1' || process.env.BETA_BASIC_AUTH === 'true') {
  app.use(basicAuth);
  log('Beta basic auth enabled');
}

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Global error handler with request IDs
  app.use((err: any, req: any, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const requestId = req.requestId || 'unknown';

    // Log error with request ID
    console.error(`[${requestId}] Error ${status}:`, err.message, err.stack);

    res.status(status).json({ 
      message,
      requestId: requestId
    });
    
    // Don't rethrow in production to prevent crash
    if (!isProduction) {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Serve static files from public directory in development
    app.use(express.static(path.resolve(import.meta.dirname, '../public')));
    await setupVite(app, server);
  } else {
    // Production: serve built files from correct location
    const staticDir = path.resolve(import.meta.dirname, '..', 'dist', 'public');
    if (!fs.existsSync(staticDir)) {
      log('FATAL: Production build directory not found at ' + staticDir);
      process.exit(1);
    }
    
    log('Serving production static files from: ' + staticDir);
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(staticDir, 'index.html'));
    });
  }

  // Background Sweeper Job for Self-Destructible Content
  const startSelfDestructSweeper = () => {
    let sweeperInterval: NodeJS.Timeout;

    const runSweeper = async () => {
      try {
        // Get all tenants to check for expired content
        const allTenants = await storage.getFeatureFlags();
        const tenantFlags = await Promise.all(
          // Get all tenants by checking feature flag overrides
          (await storage.getFeatureFlags()).map(async (flag) => {
            if (flag.key === 'self_destruct_enabled') {
              // This is inefficient but simple for demo - in production you'd want a better way to list tenants
              return null;
            }
            return null;
          })
        );

        // More efficient approach: query directly for armed self-destructs that are expired
        const { db } = await import("./db");
        const { selfDestructs } = await import("@shared/schema");
        const { eq, and, lte } = await import("drizzle-orm");
        
        const expiredSelfDestructs = await db
          .select()
          .from(selfDestructs)
          .where(
            and(
              eq(selfDestructs.status, 'armed'),
              lte(selfDestructs.destructAt, new Date())
            )
          );

        if (expiredSelfDestructs.length === 0) {
          return; // No expired content to process
        }

        log(`Self-Destruct Sweeper: Found ${expiredSelfDestructs.length} expired items to destroy`);

        for (const selfDestruct of expiredSelfDestructs) {
          try {
            // Check if self-destruct is enabled for this tenant
            const isEnabled = await storage.isSelfDestructEnabled(selfDestruct.tenantId);
            if (!isEnabled) {
              continue; // Skip if feature is disabled for this tenant
            }

            // Use destroyNow for proper transactional handling
            await storage.destroyNowSystem(
              selfDestruct.id,
              selfDestruct.tenantId, 
              `Automated destruction of expired content (TTL: ${selfDestruct.destructAt?.toISOString()})`
            );

            log(`Self-Destruct Sweeper: Destroyed ${selfDestruct.targetTable}:${selfDestruct.targetId} for tenant ${selfDestruct.tenantId}`);
          } catch (error) {
            console.error(`Self-Destruct Sweeper: Failed to destroy ${selfDestruct.targetTable}:${selfDestruct.targetId}:`, error);
            // Continue with next item even if one fails
          }
        }

        log(`Self-Destruct Sweeper: Completed processing ${expiredSelfDestructs.length} expired items`);
      } catch (error) {
        console.error('Self-Destruct Sweeper: Critical error during sweeper run:', error);
        // Don't stop the sweeper, just log and continue
      }
    };

    // Run sweeper immediately on startup (after a 30-second delay)
    setTimeout(() => {
      runSweeper();
    }, 30000);

    // Then run every 60 seconds
    sweeperInterval = setInterval(runSweeper, 60000);

    log('Self-Destruct Sweeper: Background job started (60-second intervals)');

    // Graceful shutdown handling
    const stopSweeper = () => {
      if (sweeperInterval) {
        clearInterval(sweeperInterval);
        log('Self-Destruct Sweeper: Background job stopped');
      }
    };

    process.on('SIGTERM', stopSweeper);
    process.on('SIGINT', stopSweeper);
    process.on('exit', stopSweeper);

    return stopSweeper;
  };

  // Start the sweeper job
  startSelfDestructSweeper();

  // Background Purge Scheduler Job for Scheduled Tenant Destruction
  const startPurgeScheduler = () => {
    let purgeInterval: NodeJS.Timeout;

    const runPurgeScheduler = async () => {
      try {
        // Query directly for scheduled purges that are ready to execute
        const { db } = await import("./db");
        const { purgeOperations } = await import("@shared/schema");
        const { eq, and, lte, isNotNull } = await import("drizzle-orm");
        
        // ATOMIC STATUS TRANSITIONS: Use advisory locking and atomic updates to prevent race conditions
        // This prevents multiple scheduler instances from processing the same purge
        const { sql } = await import("drizzle-orm");
        
        // Use PostgreSQL advisory locks to prevent concurrent processing of the same tenant
        const processedPurges = [];
        
        while (true) {
          // Atomically select and lock a single ready purge operation
          const readyPurges = await db
            .select()
            .from(purgeOperations)
            .where(
              and(
                eq(purgeOperations.status, 'pending'),
                lte(purgeOperations.scheduledAt, new Date()),
                isNotNull(purgeOperations.scheduledAt),
                isNotNull(purgeOperations.exportAckedAt)
              )
            )
            .limit(1)
            .for('update', { skipLocked: true }); // Skip locked rows to avoid blocking
          
          if (readyPurges.length === 0) {
            break; // No more purges ready for execution
          }
          
          const purgeOp = readyPurges[0];
          
          try {
            // Acquire advisory lock for this tenant to prevent concurrent processing
            const lockResult = await db.execute(
              sql`SELECT pg_try_advisory_lock(hashtext(${purgeOp.tenantId})) as acquired`
            );
            const lockAcquired = lockResult[0]?.acquired;
            
            if (!lockAcquired) {
              console.warn(`PURGE SCHEDULER: Could not acquire lock for tenant ${purgeOp.tenantId}, skipping`);
              continue;
            }

            // Double-check if danger_purge is enabled for this tenant (defense-in-depth)
            const featureFlags = await storage.getTenantFeatureFlags(purgeOp.tenantId);
            if (!featureFlags['danger_purge']) {
              console.warn(`PURGE SCHEDULER: Danger purge disabled for tenant ${purgeOp.tenantId}, skipping`);
              // Release advisory lock
              await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${purgeOp.tenantId}))`);
              continue;
            }

            console.error(`💥 EXECUTING SCHEDULED PURGE: Operation ${purgeOp.id} for tenant ${purgeOp.tenantName} (${purgeOp.tenantId})`);
            console.error(`💥 Requested by: ${purgeOp.requestedBy}, Reason: ${purgeOp.reason}`);

            // Start the purge operation with atomic status transition
            try {
              await storage.startPurge(purgeOp.id, purgeOp.tenantId);
              processedPurges.push(purgeOp);

              try {
                // Execute the purge with comprehensive logging
                console.error(`💥 BEGINNING TENANT DESTRUCTION: ${purgeOp.tenantName}`);
                const result = await storage.purgeTenantNow(purgeOp.tenantId, purgeOp.id);
                
                // Mark as completed
                await storage.completePurge(purgeOp.id, purgeOp.tenantId, result.recordsDestroyed, result.tablesDestroyed);
                
                console.error(`💥 PURGE COMPLETED SUCCESSFULLY: ${result.recordsDestroyed} records destroyed across ${result.tablesDestroyed} tables`);
                console.error(`💥 TENANT ${purgeOp.tenantName} (${purgeOp.tenantId}) PERMANENTLY DESTROYED`);
                
                log(`PURGE SCHEDULER: Successfully completed purge ${purgeOp.id} - ${result.recordsDestroyed} records destroyed`);
              } catch (executionError: any) {
                console.error(`💥 PURGE EXECUTION FAILED for ${purgeOp.tenantName}:`, executionError);
                
                // Mark as failed
                await storage.failPurge(purgeOp.id, purgeOp.tenantId, executionError.message);
                
                log(`PURGE SCHEDULER: Failed to execute purge ${purgeOp.id}: ${executionError.message}`);
              }
            } catch (startError: any) {
              console.error(`PURGE SCHEDULER: Failed to start purge ${purgeOp.id}:`, startError);
            }
            
            // Always release the advisory lock when done with this tenant
            try {
              await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${purgeOp.tenantId}))`);
            } catch (unlockError) {
              console.error(`PURGE SCHEDULER: Failed to release lock for tenant ${purgeOp.tenantId}:`, unlockError);
            }
            
          } catch (error) {
            console.error(`PURGE SCHEDULER: Error processing purge operation ${purgeOp.id}:`, error);
            // Try to release lock even on error
            try {
              await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${purgeOp.tenantId}))`);
            } catch (unlockError) {
              // Ignore unlock errors during error handling
            }
          }
        }

        if (processedPurges.length > 0) {
          log(`PURGE SCHEDULER: Processed ${processedPurges.length} purge operations`);
        }

        log(`PURGE SCHEDULER: Completed processing ${readyPurges.length} scheduled purges`);
      } catch (error) {
        console.error('PURGE SCHEDULER: Critical error during scheduler run:', error);
        // Don't stop the scheduler, just log and continue
      }
    };

    // Run scheduler immediately on startup (after a 45-second delay to let system settle)
    setTimeout(() => {
      runPurgeScheduler();
    }, 45000);

    // Then run every 30 seconds for more responsive purge execution
    purgeInterval = setInterval(runPurgeScheduler, 30000);

    log('🔥 PURGE SCHEDULER: Background job started (30-second intervals)');

    // Graceful shutdown handling
    const stopPurgeScheduler = () => {
      if (purgeInterval) {
        clearInterval(purgeInterval);
        log('PURGE SCHEDULER: Background job stopped');
      }
    };

    process.on('SIGTERM', stopPurgeScheduler);
    process.on('SIGINT', stopPurgeScheduler);
    process.on('exit', stopPurgeScheduler);

    return stopPurgeScheduler;
  };

  // Start the purge scheduler job
  startPurgeScheduler();

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
