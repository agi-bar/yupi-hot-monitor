export interface DataSourceConfig {
  id: string;
  name: string;
  enabled: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  retry: {
    maxRetries: number;
    retryDelayMs: number;
  };
  timeout: number;
}

export interface DataSourceCredential {
  sourceId: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface DataSourceMetrics {
  sourceId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatency: number;
  avgLatency: number;
  lastRequestAt?: Date;
  quotaUsed: number;
  quotaLimit: number;
}

export interface DataSourceLog {
  id: string;
  sourceId: string;
  action: string;
  status: 'success' | 'error' | 'rate_limited';
  message: string;
  requestParams?: any;
  responseTime?: number;
  createdAt: Date;
}

export interface SearchOptions {
  query: string;
  page?: number;
  pageSize?: number;
  timeRange?: 'today' | 'week' | 'month' | 'all';
  sortBy?: 'relevance' | 'date' | 'popularity';
}

export interface SearchResult {
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId?: string;
  publishedAt?: Date;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  author?: {
    name: string;
    username?: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
  rawUrl?: string;
}

export interface BaseDataSource {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  
  initialize(config: DataSourceConfig, credential?: DataSourceCredential): Promise<void>;
  search(options: SearchOptions): Promise<SearchResult[]>;
  healthCheck(): Promise<boolean>;
  getMetrics(): DataSourceMetrics;
  getLogs(limit?: number): DataSourceLog[];
}

export interface AuthProvider {
  getAccessToken(): Promise<string>;
  refreshToken(): Promise<void>;
  validateCredentials(): Promise<boolean>;
}

export type DataSourceStatus = 'healthy' | 'degraded' | 'unavailable' | 'disabled';

export interface DataSourceHealth {
  id: string;
  status: DataSourceStatus;
  latency: number;
  errorRate: number;
  lastCheck: Date;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: Date;
  percentage: number;
}
