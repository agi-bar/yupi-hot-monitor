import Redis from 'ioredis';
import { logInfo, logError } from './logger.js';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

export async function initializeRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logInfo('Redis', 'URL not configured, using in-memory rate limiting');
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logError('Redis', err, { message: 'Connection error' });
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      logInfo('Redis', 'Connected successfully');
      isRedisAvailable = true;
    });

    redisClient.on('ready', () => {
      logInfo('Redis', 'Client ready');
      isRedisAvailable = true;
    });

    await redisClient.connect();
    isRedisAvailable = true;
  } catch (error) {
    logError('Redis', error, { message: 'Failed to initialize, falling back to in-memory rate limiting' });
    isRedisAvailable = false;
    redisClient = null;
  }
}

export function isRedisEnabled(): boolean {
  return isRedisAvailable && redisClient !== null;
}

export async function redisIncrWithExpire(
  key: string,
  windowMs: number
): Promise<{ count: number; resetTime: number }> {
  if (!redisClient || !isRedisAvailable) {
    throw new Error('Redis not available');
  }

  const now = Date.now();
  const ttlSeconds = Math.ceil(windowMs / 1000);

  const results = await redisClient
    .multi()
    .incr(key)
    .expire(key, ttlSeconds)
    .exec();

  if (!results) {
    throw new Error('Redis transaction failed');
  }

  const count = results[0][1] as number;
  const resetTime = now + windowMs;

  return { count, resetTime };
}

export async function redisGetCount(key: string): Promise<{ count: number; ttl: number }> {
  if (!redisClient || !isRedisAvailable) {
    throw new Error('Redis not available');
  }

  const pipeline = redisClient.pipeline();
  pipeline.get(key);
  pipeline.ttl(key);

  const results = await pipeline.exec();

  if (!results) {
    throw new Error('Redis pipeline failed');
  }

  const countStr = results[0][1] as string | null;
  const ttl = results[1][1] as number;

  return {
    count: countStr ? parseInt(countStr, 10) : 0,
    ttl: ttl > 0 ? ttl : 0,
  };
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isRedisAvailable = false;
    logInfo('Redis', 'Connection closed');
  }
}

export { redisClient };
