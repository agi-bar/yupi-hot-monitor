import axios, { AxiosInstance, AxiosError } from 'axios';
import type { 
  IDataSource,
  DataSourceConfig, 
  DataSourceCredential, 
  DataSourceMetrics, 
  DataSourceLog,
  SearchOptions, 
  SearchResult,
  AuthProvider 
} from '../types/datasource.js';

export abstract class BaseDataSource implements IDataSource {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly icon: string;
  
  protected config: DataSourceConfig;
  protected credential?: DataSourceCredential;
  protected httpClient: AxiosInstance;
  protected authProvider?: AuthProvider;
  
  protected metrics: DataSourceMetrics;
  protected logs: DataSourceLog[] = [];
  protected requestCount = 0;
  protected lastResetTime = Date.now();
  
  constructor() {
    this.config = {
      id: '',
      name: '',
      enabled: true,
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerDay: 10000
      },
      retry: {
        maxRetries: 3,
        retryDelayMs: 1000
      },
      timeout: 30000
    };
    
    this.metrics = {
      sourceId: '',
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      avgLatency: 0,
      quotaUsed: 0,
      quotaLimit: 0
    };
    
    this.httpClient = axios.create({
      timeout: this.config.timeout
    });
  }
  
  async initialize(config: DataSourceConfig, credential?: DataSourceCredential): Promise<void> {
    this.config = config;
    this.credential = credential;
    this.metrics.sourceId = config.id;
    
    this.httpClient = axios.create({
      timeout: config.timeout,
      headers: {
        'User-Agent': 'HotMonitor/1.0',
        'Accept': 'application/json'
      }
    });
    
    this.addLog('initialize', 'success', 'Data source initialized');
  }
  
  protected abstract executeSearch(options: SearchOptions): Promise<SearchResult[]>;
  protected abstract ping(): Promise<boolean>;
  
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const startTime = Date.now();
    
    if (!this.config.enabled) {
      this.addLog('search', 'error', 'Data source is disabled');
      return [];
    }
    
    if (this.isRateLimited()) {
      this.addLog('search', 'rate_limited', 'Rate limit exceeded');
      return [];
    }
    
    try {
      this.requestCount++;
      this.metrics.totalRequests++;
      
      const results = await this.executeWithRetry(() => this.executeSearch(options));
      
      const latency = Date.now() - startTime;
      this.metrics.successfulRequests++;
      this.metrics.totalLatency += latency;
      this.metrics.avgLatency = this.metrics.totalLatency / this.metrics.totalRequests;
      this.metrics.lastRequestAt = new Date();
      
      this.addLog('search', 'success', `Found ${results.length} results`, options, latency);
      
      return results;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metrics.failedRequests++;
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.addLog('search', 'error', errorMessage, options, latency);
      
      throw error;
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      return await this.executeWithRetry(async () => {
        return await this.ping();
      });
    } catch {
      return false;
    }
  }
  
  getMetrics(): DataSourceMetrics {
    return {
      ...this.metrics,
      quotaUsed: this.requestCount,
      quotaLimit: this.config.rateLimit.requestsPerDay
    };
  }
  
  protected async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.config.retry.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(this.config.retry.retryDelayMs * attempt);
        }
        
        if (this.authProvider) {
          await this.authProvider.getAccessToken();
        }
        
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.isRetryableError(error)) {
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }
  
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
    }
    return false;
  }
  
  protected isRateLimited(): boolean {
    const now = Date.now();
    const minutePassed = now - this.lastResetTime > 60000;
    
    if (minutePassed) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    return this.requestCount >= this.config.rateLimit.requestsPerMinute;
  }
  
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  protected addLog(
    action: string, 
    status: 'success' | 'error' | 'rate_limited', 
    message: string, 
    requestParams?: unknown, 
    responseTime?: number
  ): void {
    const log: DataSourceLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceId: this.config.id,
      action,
      status,
      message,
      requestParams,
      responseTime,
      createdAt: new Date()
    };
    
    this.logs.push(log);
    
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }
  }
  
  getLogs(limit = 100): DataSourceLog[] {
    return this.logs.slice(-limit);
  }
  
  protected normalizeSearchResult(raw: Record<string, unknown>, mapping: Record<string, string>): SearchResult {
    const result: Record<string, unknown> = {
      source: this.id
    };
    
    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      const value = this.getNestedValue(raw, sourcePath);
      if (value !== undefined) {
        result[targetKey] = value;
      }
    }
    
    return result as unknown as SearchResult;
  }
  
  protected getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], obj);
  }
}
