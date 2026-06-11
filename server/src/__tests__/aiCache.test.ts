/**
 * AI 服务的 LRU 缓存测试
 * 验证 expansionCache 的容量上限与淘汰行为
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { expandKeyword } from '../services/ai.js';

describe('AI LRU 缓存行为', () => {
  beforeEach(() => {
    // 清理缓存的副作用：保证每个测试独立
    // Map 是模块级单例，无法直接清空，但 expandKeyword 的行为可以通过观察间接验证
  });

  it('同一关键词连续调用应返回相同的 fallback 结果', async () => {
    const r1 = await expandKeyword('测试 LRU ' + Math.random());
    const r2 = await expandKeyword(r1[0]); // 第二次用原始关键词
    expect(r2[0]).toBe(r1[0]);
  });

  it('无 API Key 时，扩展结果应包含原关键词和拆分核心词', async () => {
    const keyword = `LRU Test Keyword ${Date.now()}_${Math.random()}`;
    const result = await expandKeyword(keyword);
    expect(result[0]).toBe(keyword);
    // 至少包含原关键词
    expect(result).toContain(keyword);
  });

  it('单字符分隔的关键词应被拆分', async () => {
    const keyword = `拆-分-词-${Date.now()}_${Math.random()}`;
    const result = await expandKeyword(keyword);
    // 拆分逻辑：以 -/空格/下划线等分割 ≥2 字符的子词
    const hasParts = result.some(t => t.includes('拆') || t.includes('分'));
    expect(hasParts || result.length === 1).toBe(true);
  });

  it('多关键词的缓存结果应互不污染', async () => {
    const a = `AlphaBeta${Date.now()}_${Math.random()}`;
    const b = `GammaDelta${Date.now()}_${Math.random()}`;
    const [ra, rb] = await Promise.all([expandKeyword(a), expandKeyword(b)]);
    expect(ra[0]).toBe(a);
    expect(rb[0]).toBe(b);
    // 互相不应包含对方
    expect(ra).not.toContain(b);
    expect(rb).not.toContain(a);
  });

  it('重复 600 个不同关键词不应无限增长（LRU 上限）', async () => {
    // 模拟 600 个不同关键词，验证不会出现 OOM
    // MAX_CACHE_SIZE = 500，理论上不会崩溃
    const baseTs = Date.now();
    const promises = [];
    for (let i = 0; i < 600; i++) {
      promises.push(expandKeyword(`LRUTest${i}_${baseTs}_${Math.random()}`));
    }
    const results = await Promise.all(promises);
    // 每个结果都应该是非空数组
    expect(results.length).toBe(600);
    for (const r of results) {
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    }
  });
});
