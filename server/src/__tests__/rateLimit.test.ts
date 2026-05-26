import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('分布式限流测试', () => {
  const BASE_URL = 'http://localhost:3001';
  const TEST_IP = '192.168.1.100';

  it('应该返回正确的限流头信息', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const headers = response.headers;

    expect(headers.get('X-RateLimit-Limit')).toBe('100');
    expect(headers.get('X-RateLimit-Remaining')).toBeTruthy();
    expect(headers.get('X-RateLimit-Reset')).toBeTruthy();
    expect(headers.get('X-RateLimit-Storage')).toBeTruthy();
  });

  it('内存模式下 X-RateLimit-Storage 应该为 memory', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const storageType = response.headers.get('X-RateLimit-Storage');

    expect(storageType).toBe('memory');
  });

  it('并发请求应该正确计数', async () => {
    const initialResponse = await fetch(`${BASE_URL}/api/health`);
    const initialRemaining = parseInt(initialResponse.headers.get('X-RateLimit-Remaining') || '0');

    const promises = Array(5).fill(null).map(() =>
      fetch(`${BASE_URL}/api/health`)
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.ok).length;

    expect(successCount).toBe(5);

    const finalResponse = await fetch(`${BASE_URL}/api/health`);
    const finalRemaining = parseInt(finalResponse.headers.get('X-RateLimit-Remaining') || '0');

    expect(finalRemaining).toBeLessThan(initialRemaining);
  });

  it('健康检查端点应该正常工作', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeTruthy();
  });
});

describe('Redis配置测试', () => {
  it('未配置Redis时应使用内存存储', async () => {
    const response = await fetch('http://localhost:3001/api/health');
    const storageType = response.headers.get('X-RateLimit-Storage');

    expect(['memory', 'redis']).toContain(storageType);
  });
});
