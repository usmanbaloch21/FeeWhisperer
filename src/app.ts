import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { DatabaseConfig } from './config/database';
import { getChainConfig } from './config/chains';
import { EventScanner } from './services/EventScanner';
import { eventRoutes } from './routes/events';
import { logger } from './utils/logger';
import { ApiResponse } from './types/index';

// Load environment variables
dotenv.config();

/**
 * Main application class
 */
class Application {
  private app: express.Application;
  private scanner?: EventScanner;
  private database: DatabaseConfig;

  constructor() {
    this.app = express();
    this.database = DatabaseConfig.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });

    // Rate limiting (basic implementation)
    const rateLimit = this.createRateLimit();
    this.app.use('/api', rateLimit);
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      const response: ApiResponse<any> = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          database: this.database.isConnected(),
          scanner: this.scanner ? 'running' : 'stopped',
        },
      };
      res.json(response);
    });

    // API routes
    this.app.use('/api/events', eventRoutes);

    // 404 handler
    this.app.use('*', (_req, res) => {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Endpoint not found',
      };
      res.status(404).json(response);
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    this.app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error:', err);
      
      const response: ApiResponse<null> = {
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : err.message,
      };
      
      res.status(500).json(response);
    });
  }

  /**
   * Create basic rate limiting middleware
   */
  private createRateLimit() {
    const clients = new Map<string, { requests: number; resetTime: number }>();
    const maxRequests = parseInt(process.env.API_RATE_LIMIT || '100', 10);
    const windowMs = 60 * 1000; // 1 minute

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      
      let client = clients.get(clientId);
      
      if (!client || now > client.resetTime) {
        client = { requests: 0, resetTime: now + windowMs };
        clients.set(clientId, client);
      }
      
      client.requests++;
      
      if (client.requests > maxRequests) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Rate limit exceeded',
        };
        res.status(429).json(response);
        return;
      }
      
      next();
    };
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    try {
      // Connect to database
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fee-collector-scanner';
      await this.database.connect(mongoUri);

      // Initialize event scanner
      const chainConfig = getChainConfig('polygon');
      const scannerConfig = {
        batchSize: parseInt(process.env.SCAN_BATCH_SIZE || '10000', 10),
        intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '300000', 10),
        maxRetries: 3,
        retryDelayMs: 1000,
      };

      this.scanner = new EventScanner(chainConfig, scannerConfig);
      await this.scanner.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Application initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Start the HTTP server
   */
  public async start(): Promise<void> {
    const port = parseInt(process.env.PORT || '3000', 10);
    
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(port, () => {
          logger.info(`Server started on port ${port}`, {
            environment: process.env.NODE_ENV || 'development',
            pid: process.pid,
          });
          resolve();
        });
  
        server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use`);
          } else {
            logger.error('Server error:', error);
          }
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Stop scanner
        if (this.scanner) {
          this.scanner.stop();
        }
        
        // Disconnect from database
        await this.database.disconnect();
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

/**
 * Bootstrap the application
 */
async function bootstrap() {
  const app = new Application();
  try {
    logger.info('Starting HTTP server...');
    await app.start();
    logger.info('HTTP server started successfully');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
  try {
    // Try to initialize but don't fail if it doesn't work
    await app.initialize();
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    // Continue with server start even if initialization fails
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    logger.error('Bootstrap failed:', error);
    process.exit(1);
  });
}
export { Application };