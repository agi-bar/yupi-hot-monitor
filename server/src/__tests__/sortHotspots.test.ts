import { describe, it, expect } from 'vitest';
import { sortHotspots, calcHotScore, compareImportance, IMPORTANCE_ORDER } from '../utils/sortHotspots.js';
import type { SortableHotspot } from '../utils/sortHotspots.js';

// ========== 测试数据工厂 ==========

function makeHotspot(overrides: Partial<SortableHotspot> = {}): SortableHotspot {
  return {
    likeCount: 0,
    retweetCount: 0,
    viewCount: 0,
    replyCount: 0,
    commentCount: 0,
    quoteCount: 0,
    importance: 'medium',
    relevance: 50,
    publishedAt: '2026-02-25T10:00:00Z' as Date | string | null,
    createdAt: '2026-02-25T12:00:00Z' as Date | string,
    ...overrides,
  };
}

// ========== calcHotScore 单元测试 ==========

describe('calcHotScore', () => {
  it('纯点赞计分：likeCount * 2', () => {
    const item = makeHotspot({ likeCount: 100, retweetCount: 0, viewCount: 0, replyCount: 0, commentCount: 0, quoteCount: 0 });
    expect(calcHotScore(item)).toBeCloseTo(200, 0);
  });

  it('纯转发计分：retweetCount * 3', () => {
    const item = makeHotspot({ likeCount: 0, retweetCount: 100, viewCount: 0, replyCount: 0, commentCount: 0, quoteCount: 0 });
    expect(calcHotScore(item)).toBeCloseTo(300, 0);
  });

  it('浏览量使用 log10 压缩，不会淹没互动指标', () => {
    // 新公式: likes*2 + log10(views+1)*5
    // 561*2 + log10(10000001)*5 = 1122 + 35 = 1157
    // 11611*2 + log10(100001)*5 = 23222 + 25 = 23247
    const lowLikesHighViews = makeHotspot({ likeCount: 561, retweetCount: 0, viewCount: 10_000_000 });
    const highLikesLowViews = makeHotspot({ likeCount: 11611, retweetCount: 0, viewCount: 100_000 });

    const sorted = sortHotspots([lowLikesHighViews, highLikesLowViews], 'hot', 'desc');
    expect(sorted[0].likeCount).toBe(11611); // 高点赞应排在前面
  });

  it('浏览量为 null 时安全处理', () => {
    const item = makeHotspot({ likeCount: 100, viewCount: null });
    expect(calcHotScore(item)).toBeCloseTo(200, 0);
  });

  it('所有指标为 null 时返回 0', () => {
    const item = makeHotspot({ likeCount: null, retweetCount: null, viewCount: null, replyCount: null, commentCount: null, quoteCount: null });
    expect(calcHotScore(item)).toBeCloseTo(0, 0);
  });

  it('综合评分：各项指标正确加权', () => {
    const item = makeHotspot({ likeCount: 1000, retweetCount: 200, viewCount: 1_000_000, replyCount: 50, commentCount: 30, quoteCount: 10 });
    // 1000*2 + 200*3 + 50*1.5 + 30*1.5 + 10*2 + log10(1000001)*5
    // = 2000 + 600 + 75 + 45 + 20 + 30 = 2770
    expect(calcHotScore(item)).toBeCloseTo(2770, 0);
  });
});

// ========== compareImportance 单元测试 ==========

describe('compareImportance', () => {
  it('urgent < high < medium < low (数值递增)', () => {
    expect(IMPORTANCE_ORDER['urgent']).toBeLessThan(IMPORTANCE_ORDER['high']);
    expect(IMPORTANCE_ORDER['high']).toBeLessThan(IMPORTANCE_ORDER['medium']);
    expect(IMPORTANCE_ORDER['medium']).toBeLessThan(IMPORTANCE_ORDER['low']);
  });

  it('urgent vs low 返回负数（urgent 更重要）', () => {
    const a = makeHotspot({ importance: 'urgent' });
    const b = makeHotspot({ importance: 'low' });
    expect(compareImportance(a, b)).toBeLessThan(0);
  });

  it('相同重要程度返回 0', () => {
    const a = makeHotspot({ importance: 'high' });
    const b = makeHotspot({ importance: 'high' });
    expect(compareImportance(a, b)).toBe(0);
  });

  it('未知重要程度的 fallback 值为 4', () => {
    const a = makeHotspot({ importance: 'unknown' as any });
    const b = makeHotspot({ importance: 'low' }); // low = 3
    expect(compareImportance(a, b)).toBeGreaterThan(0);
  });
});

// ========== sortHotspots 排序规则测试 ==========

describe('sortHotspots', () => {
  // ---------- 1. createdAt 排序 ----------
  describe('按创建时间排序 (createdAt)', () => {
    const items = [
      makeHotspot({ createdAt: '2026-02-25T10:00:00Z' }),
      makeHotspot({ createdAt: '2026-02-25T14:00:00Z' }),
      makeHotspot({ createdAt: '2026-02-25T08:00:00Z' }),
      makeHotspot({ createdAt: '2026-02-25T12:00:00Z' }),
    ];

    it('desc: 最新在前', () => {
      const sorted = sortHotspots(items, 'createdAt', 'desc');
      const times = sorted.map(h => h.createdAt);
      expect(times).toEqual([
        '2026-02-25T14:00:00Z',
        '2026-02-25T12:00:00Z',
        '2026-02-25T10:00:00Z',
        '2026-02-25T08:00:00Z',
      ]);
    });

    it('asc: 最旧在前', () => {
      const sorted = sortHotspots(items, 'createdAt', 'asc');
      const times = sorted.map(h => h.createdAt);
      expect(times).toEqual([
        '2026-02-25T08:00:00Z',
        '2026-02-25T10:00:00Z',
        '2026-02-25T12:00:00Z',
        '2026-02-25T14:00:00Z',
      ]);
    });

    it('不修改原数组', () => {
      const original = [...items];
      sortHotspots(items, 'createdAt', 'desc');
      expect(items).toEqual(original);
    });
  });

  // ---------- 2. publishedAt 排序 ----------
  describe('按发布时间排序 (publishedAt)', () => {
    it('desc: 最新发布的在前', () => {
      const items = [
        makeHotspot({ publishedAt: '2026-02-24T06:00:00Z', createdAt: '2026-02-25T10:00:00Z' }),
        makeHotspot({ publishedAt: '2026-02-25T12:00:00Z', createdAt: '2026-02-25T08:00:00Z' }),
        makeHotspot({ publishedAt: '2026-02-23T18:00:00Z', createdAt: '2026-02-25T06:00:00Z' }),
      ];
      const sorted = sortHotspots(items, 'publishedAt', 'desc');
      expect(sorted.map(h => h.publishedAt)).toEqual([
        '2026-02-25T12:00:00Z',
        '2026-02-24T06:00:00Z',
        '2026-02-23T18:00:00Z',
      ]);
    });

    it('publishedAt 为 null 的排在最后 (desc)', () => {
      const items = [
        makeHotspot({ publishedAt: null, createdAt: '2026-02-25T15:00:00Z' }),
        makeHotspot({ publishedAt: '2026-02-25T12:00:00Z', createdAt: '2026-02-25T10:00:00Z' }),
        makeHotspot({ publishedAt: null, createdAt: '2026-02-25T08:00:00Z' }),
      ];
      const sorted = sortHotspots(items, 'publishedAt', 'desc');
      expect(sorted[0].publishedAt).toBe('2026-02-25T12:00:00Z');
      expect(sorted[1].createdAt).toBe('2026-02-25T15:00:00Z');
      expect(sorted[2].createdAt).toBe('2026-02-25T08:00:00Z');
    });
  });

  // ---------- 3. importance 排序 ----------
  describe('按重要程度排序 (importance)', () => {
    const items = [
      makeHotspot({ importance: 'low', createdAt: '2026-02-25T10:00:00Z' }),
      makeHotspot({ importance: 'urgent', createdAt: '2026-02-25T09:00:00Z' }),
      makeHotspot({ importance: 'medium', createdAt: '2026-02-25T11:00:00Z' }),
      makeHotspot({ importance: 'high', createdAt: '2026-02-25T08:00:00Z' }),
      makeHotspot({ importance: 'urgent', createdAt: '2026-02-25T12:00:00Z' }),
    ];

    it('desc: 最重要在前 (urgent → high → medium → low)', () => {
      const sorted = sortHotspots(items, 'importance', 'desc');
      const importances = sorted.map(h => h.importance);
      expect(importances).toEqual(['urgent', 'urgent', 'high', 'medium', 'low']);
    });

    it('asc: 最不重要在前 (low → medium → high → urgent)', () => {
      const sorted = sortHotspots(items, 'importance', 'asc');
      const importances = sorted.map(h => h.importance);
      expect(importances).toEqual(['low', 'medium', 'high', 'urgent', 'urgent']);
    });

    it('相同重要程度时按创建时间倒序排列 (desc)', () => {
      const sorted = sortHotspots(items, 'importance', 'desc');
      const urgents = sorted.filter(h => h.importance === 'urgent');
      expect(urgents[0].createdAt).toBe('2026-02-25T12:00:00Z');
      expect(urgents[1].createdAt).toBe('2026-02-25T09:00:00Z');
    });

    it('相同重要程度时按创建时间正序排列 (asc)', () => {
      const sorted = sortHotspots(items, 'importance', 'asc');
      const urgents = sorted.filter(h => h.importance === 'urgent');
      expect(urgents[0].createdAt).toBe('2026-02-25T09:00:00Z');
      expect(urgents[1].createdAt).toBe('2026-02-25T12:00:00Z');
    });
  });

  // ---------- 4. relevance 排序 ----------
  describe('按相关性排序 (relevance)', () => {
    const items = [
      makeHotspot({ relevance: 50 }),
      makeHotspot({ relevance: 95 }),
      makeHotspot({ relevance: 30 }),
      makeHotspot({ relevance: 85 }),
      makeHotspot({ relevance: 70 }),
    ];

    it('desc: 最高相关性在前', () => {
      const sorted = sortHotspots(items, 'relevance', 'desc');
      expect(sorted.map(h => h.relevance)).toEqual([95, 85, 70, 50, 30]);
    });

    it('asc: 最低相关性在前', () => {
      const sorted = sortHotspots(items, 'relevance', 'asc');
      expect(sorted.map(h => h.relevance)).toEqual([30, 50, 70, 85, 95]);
    });
  });

  // ---------- 5. hot 热度综合排序 ----------
  describe('按热度综合排序 (hot)', () => {
    it('desc: 热度最高在前', () => {
      const items = [
        makeHotspot({ likeCount: 100, retweetCount: 10, viewCount: 1000 }),
        makeHotspot({ likeCount: 5000, retweetCount: 500, viewCount: 50000 }),
        makeHotspot({ likeCount: 10, retweetCount: 0, viewCount: 100 }),
      ];
      const sorted = sortHotspots(items, 'hot', 'desc');
      expect(sorted[0].likeCount).toBe(5000);
      expect(sorted[1].likeCount).toBe(100);
      expect(sorted[2].likeCount).toBe(10);
    });

    it('asc: 热度最低在前', () => {
      const items = [
        makeHotspot({ likeCount: 5000, retweetCount: 200, viewCount: 100000 }),
        makeHotspot({ likeCount: 10, retweetCount: 0, viewCount: 100 }),
        makeHotspot({ likeCount: 500, retweetCount: 50, viewCount: 10000 }),
      ];
      const sorted = sortHotspots(items, 'hot', 'asc');
      expect(sorted[0].likeCount).toBe(10);
      expect(sorted[1].likeCount).toBe(500);
      expect(sorted[2].likeCount).toBe(5000);
    });

    it('【核心修复验证】高点赞低浏览 > 低点赞高浏览', () => {
      const items = [
        makeHotspot({ likeCount: 561, retweetCount: 0, viewCount: 10_000_000 }),
        makeHotspot({ likeCount: 11611, retweetCount: 0, viewCount: 100_000 }),
        makeHotspot({ likeCount: 39796, retweetCount: 0, viewCount: 5_000_000 }),
      ];

      const sorted = sortHotspots(items, 'hot', 'desc');

      expect(sorted[0].likeCount).toBe(39796);
      expect(sorted[1].likeCount).toBe(11611);
      expect(sorted[2].likeCount).toBe(561);
    });

    it('null 互动数据等同于 0', () => {
      const items = [
        makeHotspot({ likeCount: null, retweetCount: null, viewCount: null, replyCount: null, commentCount: null, quoteCount: null }),
        makeHotspot({ likeCount: 100, retweetCount: 0, viewCount: 0 }),
      ];
      const sorted = sortHotspots(items, 'hot', 'desc');
      expect(sorted[0].likeCount).toBe(100);
      expect(sorted[1].likeCount).toBe(null);
    });

    it('新公式下转发权重高于点赞', () => {
      // 新公式: likes*2 vs retweets*3
      // 100 RT = 300 vs 100 likes = 200
      const likes = makeHotspot({ likeCount: 100, retweetCount: 0, viewCount: 0 });
      const retweets = makeHotspot({ likeCount: 0, retweetCount: 100, viewCount: 0 });
      const sorted = sortHotspots([likes, retweets], 'hot', 'desc');
      expect(sorted[0].retweetCount).toBe(100); // 转发权重 3 > 点赞权重 2
    });

    it('【截图场景验证】11774 likes 应排在 11611 likes 前面', () => {
      const items = [
        makeHotspot({ likeCount: 11611, retweetCount: 0, viewCount: 500_000 }),
        makeHotspot({ likeCount: 11774, retweetCount: 0, viewCount: 200_000 }),
      ];
      const sorted = sortHotspots(items, 'hot', 'desc');
      expect(sorted[0].likeCount).toBe(11774);
      expect(sorted[1].likeCount).toBe(11611);
    });

    it('点赞是主导因素，浏览量差异不会翻转排名', () => {
      // 5000*2 + log10(10001)*5 = 10000 + 20 = 10020
      // 1000*2 + log10(100001)*5 = 2000 + 25 = 2025
      const manyMoreLikes = makeHotspot({ likeCount: 5000, retweetCount: 0, viewCount: 10_000 });
      const fewerLikes = makeHotspot({ likeCount: 1000, retweetCount: 0, viewCount: 100_000 });
      const sorted = sortHotspots([fewerLikes, manyMoreLikes], 'hot', 'desc');
      expect(sorted[0].likeCount).toBe(5000); // 10020 > 2025
    });
  });

  // ---------- 边界情况 ----------
  describe('边界情况', () => {
    it('空数组返回空数组', () => {
      expect(sortHotspots([], 'createdAt', 'desc')).toEqual([]);
    });

    it('单元素数组保持不变', () => {
      const items = [makeHotspot({ relevance: 42 })];
      const sorted = sortHotspots(items, 'relevance', 'desc');
      expect(sorted.length).toBe(1);
      expect(sorted[0].relevance).toBe(42);
    });

    it('未知排序字段降级为 createdAt', () => {
      const items = [
        makeHotspot({ createdAt: '2026-02-25T14:00:00Z' }),
        makeHotspot({ createdAt: '2026-02-25T10:00:00Z' }),
      ];
      const sorted = sortHotspots(items, 'unknownField', 'desc');
      expect(sorted[0].createdAt).toBe('2026-02-25T14:00:00Z');
    });

    it('支持 Date 对象和 ISO 字符串混合', () => {
      const items = [
        makeHotspot({ createdAt: new Date('2026-02-25T14:00:00Z') as unknown as string }),
        makeHotspot({ createdAt: '2026-02-25T10:00:00Z' }),
        makeHotspot({ createdAt: new Date('2026-02-25T16:00:00Z') as unknown as string }),
      ];
      const sorted = sortHotspots(items, 'createdAt', 'desc');
      expect(new Date(sorted[0].createdAt as string | Date).getTime()).toBeGreaterThan(new Date(sorted[1].createdAt as string | Date).getTime());
      expect(new Date(sorted[1].createdAt as string | Date).getTime()).toBeGreaterThan(new Date(sorted[2].createdAt as string | Date).getTime());
    });

    it('默认排序方向为 desc', () => {
      const items = [
        makeHotspot({ createdAt: '2026-02-25T10:00:00Z' }),
        makeHotspot({ createdAt: '2026-02-25T14:00:00Z' }),
      ];
      const sorted = sortHotspots(items, 'createdAt');
      expect(sorted[0].createdAt).toBe('2026-02-25T14:00:00Z');
    });
  });
});
