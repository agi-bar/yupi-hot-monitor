/**
 * 应用入口
 * 优化:
 * 1. 引入统一的 errorHandler 兜底
 * 2. 手动检查接口加防抖：同一实例 1 分钟内不重复触发
 * 3. cron 任务加 try/catch 和失败计数
 */
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
import { runHotspotCheck } from './jobs/hotspotChecker.js';
import { cleanupOldNotifications } from './jobs/notificationCleaner.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logEnvironmentCheck, warmupUserAgents } from './utils/envCheck.js';

dotenv.config();

// 启动检查
logEnvironmentCheck();
warmupUserAgents();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/keywords', keywordsRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notifications', notificationsRouter);

// Health check (含 DB 状态)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { database: 'ok' }
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: 'error' },
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 手动触发检查：1 分钟内同一实例不重复执行，避免重入
let checkInProgress = false;
let lastCheckAt = 0;
const CHECK_DEBOUNCE_MS = 60_000;

app.post('/api/check-hotspots', async (req, res) => {
  if (checkInProgress) {
    return res.status(429).json({ error: '热点检查正在进行中' });
  }
  const now = Date.now();
  if (now - lastCheckAt < CHECK_DEBOUNCE_MS) {
    return res.status(429).json({
      error: `热点检查刚执行过，请等待 ${Math.ceil((CHECK_DEBOUNCE_MS - (now - lastCheckAt)) / 1000)} 秒`,
      retryAfter: CHECK_DEBOUNCE_MS - (now - lastCheckAt)
    });
  }
  checkInProgress = true;
  let checkSucceeded = false;
  try {
    await runHotspotCheck(io);
    checkSucceeded = true;
    res.json({ message: 'Hotspot check completed' });
  } catch (error) {
    console.error('Manual check failed:', error);
    res.status(500).json({ error: 'Failed to run hotspot check' });
  } finally {
    checkInProgress = false;
    // 成功才更新 lastCheckAt，失败允许重试
    if (checkSucceeded) lastCheckAt = Date.now();
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (keywords: string[]) => {
    if (!Array.isArray(keywords) || keywords.length > 50) return;
    keywords.forEach(kw => {
      if (typeof kw === 'string' && kw.length < 100) {
        socket.join(`keyword:${kw}`);
      }
    });
    console.log(`Socket ${socket.id} subscribed to:`, keywords);
  });

  socket.on('unsubscribe', (keywords: string[]) => {
    if (!Array.isArray(keywords)) return;
    keywords.forEach(kw => {
      if (typeof kw === 'string') socket.leave(`keyword:${kw}`);
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Cron 任务：每 30 分钟跑一次热点检查
let cronFailureCount = 0;
cron.schedule('*/30 * * * *', async () => {
  console.log('🔄 Running scheduled hotspot check...');
  if (checkInProgress) {
    console.warn('⚠️ Skipping cron run, previous check still in progress');
    return;
  }
  checkInProgress = true;
  try {
    await runHotspotCheck(io);
    cronFailureCount = 0;
    console.log('✅ Scheduled hotspot check completed');
  } catch (error) {
    cronFailureCount++;
    console.error(`❌ Scheduled hotspot check failed (count: ${cronFailureCount}):`, error);
  } finally {
    checkInProgress = false;
  }
});

// Cron 任务：每天凌晨 3 点清理 30 天前已读通知
cron.schedule('0 3 * * *', async () => {
  try {
    await cleanupOldNotifications();
  } catch (error) {
    console.error('❌ Notification cleanup failed:', error);
  }
});

export { io };

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
  🔥 热点监控服务启动成功!
  📡 Server running on http://localhost:${PORT}
  🔌 WebSocket ready
  ⏰ Hotspot check scheduled every 30 minutes
  `);
});

// 统一错误处理（必须放在最后）
app.use(errorHandler);

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
