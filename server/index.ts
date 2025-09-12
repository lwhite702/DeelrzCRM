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
    res.setHeader('WWW-Authenticate', 'Basic realm="DeelrzCRM Beta Access"');
    return res.status(401).json({ message: 'Authentication required for beta access' });
  }

  const credentials = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');
  
  const validUser = process.env.BETA_USER || 'beta';
  const validPass = process.env.BETA_PASS || 'access';

  if (username !== validUser || password !== validPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="DeelrzCRM Beta Access"');
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
