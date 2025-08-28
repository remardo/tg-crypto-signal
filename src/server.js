const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import configurations and utilities
const config = require('./config/app');
const { connectRedis } = require('./config/redis'); // Using real Redis
const { logger } = require('./utils/logger');

// Import routes
const channelRoutes = require('./routes/channels');
const signalRoutes = require('./routes/signals');
const positionRoutes = require('./routes/positions');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings').router;
const tradingRoutes = require('./routes/trading');
const balanceRoutes = require('./routes/balance');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

// Import services
const TelegramService = require('./services/telegramService');
const SignalFeedService = require('./services/signalFeedService');
const ExecutionService = require('./services/executionService');
const ChannelService = require('./services/channelService');
const PositionService = require('./services/positionService');

class Server {
  constructor() {
    this.app = express();
    this.server = null;
    this.services = {};
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      // Connect to Redis
      await connectRedis();
      logger.info('Redis connection established');

      // Initialize services
      await this.initializeServices();
      
      // Setup Express middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      logger.info('Server initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  async initializeServices() {
    try {
      // Initialize all services
      this.services.telegram = new TelegramService();
      this.services.signalFeed = new SignalFeedService();
      this.services.execution = new ExecutionService();
      this.services.channel = new ChannelService();
      this.services.position = new PositionService();

      // Initialize services in order
      await this.services.telegram.initialize();
      await this.services.signalFeed.initialize();
      await this.services.execution.initialize();
      await this.services.channel.initialize();
      await this.services.position.initialize();

      // Make services available globally
      this.app.locals.services = this.services;

      logger.info('All services initialized successfully');

    } catch (error) {
      logger.error('Error initializing services:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for development
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.isDevelopment() 
        ? ['http://localhost:3000', 'http://localhost:3001'] 
        : process.env.ALLOWED_ORIGINS?.split(',') || [],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.security.rateLimitWindow,
      max: config.security.rateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Request logging
    this.app.use(morgan(config.logging.format, {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID and timing
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      req.id = Math.random().toString(36).substring(2, 15);
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV,
        services: {
          telegram: this.services.telegram?.getStatus() || { status: 'not initialized' },
          signalFeed: this.services.signalFeed?.getServiceStatus() || { status: 'not initialized' },
          execution: this.services.execution?.getExecutionStats() || { status: 'not initialized' },
          channel: this.services.channel?.getStatus() || { status: 'not initialized' },
          position: this.services.position?.getServiceStatus() || { status: 'not initialized' }
        }
      });
    });
  }

  setupRoutes() {
    // API routes - must be registered BEFORE static files
    this.app.use('/api/channels', channelRoutes);
    this.app.use('/api/signals', signalRoutes);
    this.app.use('/api/positions', positionRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);
    this.app.use('/api/settings', settingsRoutes);
    this.app.use('/api/trading', tradingRoutes);
    this.app.use('/api/balance', balanceRoutes);

    // Direct balance route for testing
    this.app.get('/api/balance-direct', (req, res) => {
      res.json({
        success: true,
        data: {
          futures: { balance: 0, availableBalance: 0 },
          spot: { balance: 0, availableBalance: 0 },
          timestamp: new Date().toISOString()
        },
        message: 'Direct balance route working!'
      });
    });

    // Test route to verify API routing works
    this.app.get('/api/test', (req, res) => {
      res.json({ message: 'API routing is working!', timestamp: new Date().toISOString() });
    });

    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Root endpoint - serve the web interface
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        message: 'Crypto Trading Bot API v1.0.0',
        endpoints: {
          channels: '/api/channels',
          signals: '/api/signals',
          positions: '/api/positions',
          dashboard: '/api/dashboard',
          settings: '/api/settings',
          balance: '/api/balance',
          health: '/health'
        },
        documentation: '/api/docs'
      });
    });

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `The endpoint ${req.originalUrl} does not exist`,
        availableEndpoints: [
          '/api/channels',
          '/api/signals',
          '/api/positions',
          '/api/dashboard',
          '/api/settings'
        ]
      });
    });
  }

  setupErrorHandling() {
    // Error handling middleware
    this.app.use(errorHandler);

    // Catch unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      if (config.isProduction()) {
        this.gracefulShutdown();
      }
    });
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);
        this.gracefulShutdown();
      });
    });
  }

  async start() {
    try {
      const port = config.PORT;
      
      this.server = this.app.listen(port, () => {
        logger.info(`Server started on port ${port}`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Health check: http://localhost:${port}/health`);
        logger.info(`API documentation: http://localhost:${port}/api`);
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        process.exit(1);
      });

      return this.server;

    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Shutdown services in reverse order
      const serviceNames = Object.keys(this.services).reverse();
      for (const serviceName of serviceNames) {
        try {
          await this.services[serviceName].shutdown();
          logger.info(`${serviceName} service shut down`);
        } catch (error) {
          logger.error(`Error shutting down ${serviceName} service:`, error);
        }
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Export server instance
const server = new Server();

// Auto-start if this file is run directly
if (require.main === module) {
  server.initialize()
    .then(() => server.start())
    .catch((error) => {
      logger.error('Failed to start application:', error);
      process.exit(1);
    });
}

module.exports = server;