const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');

// Load environment variables
dotenv.config();

// Import routes
const { routeRoutes, stopRoutes, commuteRoutes } = require('./routes');

// Import services for hybrid initialization
const { GraphService } = require('./services/GraphService');
const FareCalculator = require('./services/FareCalculator');
const StopwatchService = require('./services/StopwatchService');
const AStarPathfinder = require('./services/AStarPathfinder');

// Initialize Express app
const app = express();

// =============================================================================
// SERVICE STATUS TRACKING (Hybrid Initialization)
// =============================================================================

const serviceStatus = {
  status: 'initializing', // 'initializing' | 'ready' | 'failed'
  mongodb: { connected: false },
  graphService: {
    initialized: false,
    nodeCount: 0,
    routeCount: 0,
  },
  startedAt: Date.now(),
  error: null,
};

// Global service instances (populated after init)
let graphService = null;
let fareCalculator = null;
let stopwatchService = null;
let pathfinder = null;

/**
 * Initialize graph services (non-blocking, runs in background)
 */
async function initializeGraphServices(retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Server] Initializing graph services (attempt ${attempt}/${retries})...`);
      
      graphService = new GraphService();
      await graphService.initialize();
      
      fareCalculator = new FareCalculator();
      stopwatchService = new StopwatchService();
      pathfinder = new AStarPathfinder(graphService, fareCalculator, stopwatchService);
      
      serviceStatus.graphService.initialized = true;
      serviceStatus.graphService.nodeCount = graphService.nodeIndex?.size || 0;
      serviceStatus.graphService.routeCount = graphService.routes?.length || 0;
      serviceStatus.status = 'ready';
      
      console.log('[Server] ✅ Graph services initialized successfully');
      return true;
    } catch (error) {
      console.error(`[Server] ❌ Graph init failed (attempt ${attempt}):`, error.message);
      
      if (attempt < retries) {
        console.log(`[Server] Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2; // Exponential backoff
      } else {
        serviceStatus.status = 'failed';
        serviceStatus.error = error.message;
        console.error('[Server] ❌ All graph init retries failed');
        return false;
      }
    }
  }
}

/**
 * Get service instances (for use in routes)
 */
function getServices() {
  return { graphService, fareCalculator, stopwatchService, pathfinder };
}

/**
 * Check if services are ready
 */
function isServicesReady() {
  return serviceStatus.status === 'ready';
}

// Export for use by commuteRoutes
module.exports.getServices = getServices;
module.exports.isServicesReady = isServicesReady;
module.exports.serviceStatus = serviceStatus;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB().then(() => {
  serviceStatus.mongodb.connected = true;
}).catch((err) => {
  console.error('[Server] MongoDB connection failed:', err.message);
  serviceStatus.mongodb.connected = false;
});

// =============================================================================
// HEALTH & STATUS ENDPOINTS
// =============================================================================

// Basic health check (no auth required)
app.get('/', (req, res) => {
  console.log('[Health] ✓ Basic health check endpoint hit');
  res.status(200).json({
    message: 'Para Mobile API is running',
    version: '2.0.0',
    status: serviceStatus.status,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
  });
});

// Detailed health check (authenticated)
app.get('/api/health', (req, res) => {
  // TODO: Add auth check when auth middleware is implemented
  // For now, return detailed health info
  
  const uptime = Math.floor((Date.now() - serviceStatus.startedAt) / 1000);
  
  res.status(serviceStatus.status === 'ready' ? 200 : 503).json({
    status: serviceStatus.status,
    services: {
      mongodb: { connected: serviceStatus.mongodb.connected },
      graphService: {
        initialized: serviceStatus.graphService.initialized,
        nodeCount: serviceStatus.graphService.nodeCount,
        routeCount: serviceStatus.graphService.routeCount,
      },
    },
    uptime,
    timestamp: new Date().toISOString(),
    ...(serviceStatus.error && { error: serviceStatus.error }),
  });
});

// API Routes
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRoutes);
app.use('/api/commutes', commuteRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
  🚐 Para Mobile API Server
  ========================
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  🚀 Server running on port ${PORT}
  📍 Health check: http://localhost:${PORT}/
  
  📚 API Endpoints:
  ├── Routes:    http://localhost:${PORT}/api/routes
  ├── Stops:     http://localhost:${PORT}/api/stops
  └── Commutes:  http://localhost:${PORT}/api/commutes
      ├── POST /search    - A* route search
      ├── GET  /routes    - List transit routes
      ├── GET  /nearby    - Find nearby stops
      ├── GET  /config    - Get routing config
      ├── GET  /fare      - Calculate fare
      └── POST /stopwatch - Record GPS traces
  `);
  
  // Start graph service initialization in background (non-blocking)
  initializeGraphServices().then((success) => {
    if (success) {
      console.log('[Server] 🎉 All services ready - accepting requests');
    } else {
      console.warn('[Server] ⚠️ Graph services failed - route search unavailable');
    }
  });
});

module.exports = app;
