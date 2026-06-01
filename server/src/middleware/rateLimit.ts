import { Request, Response, NextFunction } from 'express';
import { isRedisEnabled, redisIncrWithExpire } from '../utils/redis.js';
import { logError } from '../utils/logger.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const inMemoryStore: RateLimitStore = {};

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 200;

export function rateLimit(options?: {
  windowMs?: number;
  max?: number;
  message?: string;
}) {
  const windowMs = options?.windowMs || DEFAULT_WINDOW_MS;
  const maxRequests = options?.max || DEFAULT_MAX_REQUESTS;
  const message = options?.message || 'Too many requests, please try again later';

  return async (req: Request, res: Response, next: NextFunction) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string' 
      ? forwardedFor.split(',')[0]?.trim() 
      : (typeof forwardedFor === 'object' ? forwardedFor?.[0] : undefined);
    const key = clientIp || req.ip || 'unknown';
    const now = Date.now();

    try {
      if (isRedisEnabled()) {
        await handleRedisRateLimit(key, now, windowMs, maxRequests, message, res, next);
      } else {
        handleInMemoryRateLimit(key, now, windowMs, maxRequests, message, res, next);
      }
    } catch (error) {
      logError('RateLimit', error, { message: 'Error, falling back to in-memory' });
      handleInMemoryRateLimit(key, now, windowMs, maxRequests, message, res, next);
    }
  };
}

async function handleRedisRateLimit(
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number,
  message: string,
  res: Response,
  next: NextFunction
): Promise<void> {
  const redisKey = `ratelimit:${key}`;
  const { count, resetTime } = await redisIncrWithExpire(redisKey, windowMs);

  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
  res.setHeader('X-RateLimit-Storage', 'redis');

  if (count > maxRequests) {
    res.setHeader('Retry-After', Math.ceil((resetTime - Date.now()) / 1000).toString());
    res.status(429).json({
      error: message,
      retryAfter: Math.ceil((resetTime - now) / 1000)
    });
    return;
  }

  next();
}

function handleInMemoryRateLimit(
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number,
  message: string,
  res: Response,
  next: NextFunction
): void {
  if (!inMemoryStore[key] || now > inMemoryStore[key].resetTime) {
    inMemoryStore[key] = {
      count: 0,
      resetTime: now + windowMs
    };
  }

  inMemoryStore[key].count++;

  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - inMemoryStore[key].count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(inMemoryStore[key].resetTime / 1000).toString());
  res.setHeader('X-RateLimit-Storage', 'memory');

  if (inMemoryStore[key].count > maxRequests) {
    res.status(429).json({
      error: message,
      retryAfter: Math.ceil((inMemoryStore[key].resetTime - now) / 1000)
    });
    return;
  }

  next();
}

const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function cleanupInMemoryStore(): void {
  const now = Date.now();
  const keys = Object.keys(inMemoryStore);
  let processed = 0;
  
  const cleanupBatch = () => {
    const keysToDelete: string[] = [];
    for (let i = 0; i < CLEANUP_BATCH_SIZE && processed < keys.length; i++, processed++) {
      const key = keys[processed];
      if (inMemoryStore[key] && now > inMemoryStore[key].resetTime) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => delete inMemoryStore[key]);
    
    if (processed < keys.length) {
      setImmediate(cleanupBatch);
    }
  };
  
  cleanupBatch();
}

setInterval(cleanupInMemoryStore, CLEANUP_INTERVAL_MS);

export function getRateLimitStats() {
  const inMemoryCount = Object.keys(inMemoryStore).length;
  return {
    storageType: isRedisEnabled() ? 'redis' : 'memory',
    inMemoryKeys: inMemoryCount
  };
}
