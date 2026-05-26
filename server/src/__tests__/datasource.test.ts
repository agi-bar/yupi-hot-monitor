import { describe, it, expect } from 'vitest';
import { BaiduDataSource } from '../datasources/BaiduDataSource.js';

describe('BaiduDataSource', () => {
  it('should have correct id', () => {
    const source = new BaiduDataSource();
    expect(source.id).toBe('baidu');
  });
  
  it('should have correct name', () => {
    const source = new BaiduDataSource();
    expect(source.name).toBe('百度搜索');
  });
  
  it('should have correct icon', () => {
    const source = new BaiduDataSource();
    expect(source.icon).toBe('🔍');
  });
  
  it('should be instance of BaiduDataSource', () => {
    const source = new BaiduDataSource();
    expect(source).toBeInstanceOf(BaiduDataSource);
  });
});

describe('DataSource Configuration', () => {
  it('should initialize with default config', async () => {
    const source = new BaiduDataSource();
    await source.initialize({
      id: 'baidu',
      name: '百度搜索',
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
    });
    
    const metrics = source.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.failedRequests).toBe(0);
  });
});
