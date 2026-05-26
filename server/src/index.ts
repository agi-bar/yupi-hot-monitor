import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cron from 'node-cron';

import { prisma } from './db.js';
import keywordsRouter from './routes/keywords.js';
import hotspotsRouter from './routes/hotspots.js';
import settingsRouter from './routes/settings.js';
import notificationsRouter from './routes/notifications.js';
import sourcesRouter from './routes/sources.js';
import datasourcesRouter from './routes/datasources.js';
import { runHotspotCheck } from './jobs/hotspotChecker.js';
import { dataSourceManager } from './datasources/DataSourceManager.js';
import { rateLimit } from './middleware/rateLimit.js';
import { initializeRedis, closeRedis } from './utils/redis.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per window
  message: 'Too many requests, please try again later'
}));

// Routes
app.use('/api/keywords', keywordsRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/datasources', datasourcesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual trigger for hotspot check
app.post('/api/check-hotspots', async (req, res) => {
  try {
    await runHotspotCheck(io);
    res.json({ message: 'Hotspot check completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to run hotspot check' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (keywords: string[]) => {
    keywords.forEach(kw => socket.join(`keyword:${kw}`));
    console.log(`Socket ${socket.id} subscribed to:`, keywords);
  });

  socket.on('unsubscribe', (keywords: string[]) => {
    keywords.forEach(kw => socket.leave(`keyword:${kw}`));
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Scheduled job: Run hotspot check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('🔄 Running scheduled hotspot check...');
  try {
    await runHotspotCheck(io);
    console.log('✅ Scheduled hotspot check completed');
  } catch (error) {
    console.error('❌ Scheduled hotspot check failed:', error);
  }
});

// Export for use in other modules
export { io };

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await initializeRedis();
    await dataSourceManager.initialize();
    console.log('✅ DataSourceManager initialized');

    httpServer.listen(PORT, () => {
      console.log(`
  🔥 热点监控服务启动成功!
  📡 Server running on http://localhost:${PORT}
  🔌 WebSocket ready
  ⏰ Hotspot check scheduled every 30 minutes
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
});
