/**
 * 频率限制器 + 随机 User-Agent + 通用 HTTP 工具
 *
 * 解决之前 chinaSearch.ts 和 search.ts 各有一份重复实现的问题。
 * 所有爬虫统一从这里 import。
 */
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

// ============================================================
// User-Agent 池（轮询避免被反爬识别）
// ============================================================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// 频率限制器
// 用法：const limiter = new RateLimiter(3000); await limiter.wait();
// ============================================================
export class RateLimiter {
  private lastRequestTime = 0;
  constructor(private minIntervalMs: number = 5000) {}

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /** 不阻塞的占位（用于多源并发时让一组请求错开起始时间） */
  async stagger(offsetMs: number = 0): Promise<void> {
    await new Promise(r => setTimeout(r, offsetMs));
  }
}

// 各源独立 limiter（全局单例，避免互相阻塞）
export const limiters = {
  bing: new RateLimiter(5000),
  google: new RateLimiter(10000),
  duckduckgo: new RateLimiter(3000),
  hackernews: new RateLimiter(1000),
  sogou: new RateLimiter(3000),
  bilibili: new RateLimiter(2000),
  weibo: new RateLimiter(3000),
  twitter: new RateLimiter(0) // Twitter 通过 twitterapi.io 限流
};

// ============================================================
// 带 UA + 频率限制的 GET 工具
// ============================================================
export interface SafeGetOptions {
  limiter?: RateLimiter;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  cookies?: Record<string, string>;
}

export async function safeGet<T = unknown>(
  url: string,
  params: Record<string, string | number> = {},
  options: SafeGetOptions = {}
): Promise<AxiosResponse<T> | null> {
  if (options.limiter) await options.limiter.wait();

  const config: AxiosRequestConfig = {
    params,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.5',
      ...options.headers
    },
    timeout: options.timeoutMs ?? 15000,
    maxRedirects: options.maxRedirects ?? 5
  };

  if (options.cookies) {
    config.headers = {
      ...config.headers,
      'Cookie': Object.entries(options.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    };
  }

  try {
    return await axios.get<T>(url, config);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`safeGet error [${url}]:`, error.message);
    }
    return null;
  }
}
