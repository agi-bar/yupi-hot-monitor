/**
 * 热点排序工具函数
 * 供后端路由和前端客户端排序共用
 *
 * 热度综合公式：
 *   likes×2 + retweets×3 + replies×1.5 + comments×1.5 + quotes×2 + log10(views+1)×5
 *   log 压缩浏览量避免淹没互动指标，同时保留合理区分度
 *
 * 归一化（展示用）：log10(raw+1) × 25，上限 100
 */

export interface SortableHotspot {
  likeCount: number | null;
  retweetCount: number | null;
  viewCount: number | null;
  replyCount: number | null;
  commentCount: number | null;
  quoteCount: number | null;
  importance: string;
  relevance: number;
  publishedAt: Date | string | null;
  createdAt: Date | string | null;
}

/** 重要程度数值映射，数值越小越重要 */
export const IMPORTANCE_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * 计算热度原始分数（加权求和）
 * 浏览量使用 log10 压缩：100K views → 50分，10M views → 70分
 */
export function calcHotScoreRaw(item: SortableHotspot): number {
  const likes = item.likeCount || 0;
  const retweets = item.retweetCount || 0;
  const replies = item.replyCount || 0;
  const comments = item.commentCount || 0;
  const quotes = item.quoteCount || 0;
  const views = item.viewCount || 0;

  // log10 压缩浏览量，系数 5：100K views ≈ 25, 1M views ≈ 30, 10M views ≈ 35
  const viewScore = views > 0 ? Math.log10(views + 1) * 5 : 0;

  return likes * 2 + retweets * 3 + replies * 1.5 + comments * 1.5 + quotes * 2 + viewScore;
}

/**
 * 将热度原始分数归一化到 0-100（log 压缩）
 */
export function normalizeHotScore(raw: number): number {
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}

/**
 * 计算热度综合分数（原始分数，用于排序比较）
 * 
 * 注意：排序用原始分数（保留排序精度），展示用归一化分数（0-100 可读）
 */
export function calcHotScore(item: SortableHotspot): number {
  return calcHotScoreRaw(item);
}

/**
 * 比较两个热点的重要程度
 * 返回负数 = a 更重要，正数 = b 更重要，0 = 相同
 */
export function compareImportance(a: SortableHotspot, b: SortableHotspot): number {
  return (IMPORTANCE_ORDER[a.importance] ?? 4) - (IMPORTANCE_ORDER[b.importance] ?? 4);
}

/**
 * 获取时间戳（毫秒），兼容 Date 对象和 ISO 字符串
 */
function toTimestamp(d: Date | string | null | undefined): number {
  if (!d) return 0;
  return typeof d === 'string' ? new Date(d).getTime() : d.getTime();
}

/**
 * 通用排序函数
 * @param items - 热点数组（会被复制，不修改原数组）
 * @param sortBy - 排序字段
 * @param sortOrder - 排序方向 'asc' | 'desc'
 * @returns 排序后的新数组
 */
export function sortHotspots<T extends SortableHotspot>(
  items: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): T[] {
  const sorted = [...items];
  const desc = sortOrder === 'desc';

  sorted.sort((a, b) => {
    let result: number;

    switch (sortBy) {
      case 'publishedAt': {
        const ta = toTimestamp(a.publishedAt);
        const tb = toTimestamp(b.publishedAt);
        result = ta - tb;
        if (result === 0) {
          result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        }
        break;
      }

      case 'importance': {
        result = compareImportance(a, b);
        if (result === 0) {
          result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
          return desc ? -(result) : result;
        }
        return desc ? result : -result;
      }

      case 'relevance':
        result = a.relevance - b.relevance;
        break;

      case 'hot':
        result = calcHotScore(a) - calcHotScore(b);
        break;

      default: // createdAt
        result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        break;
    }

    return desc ? -(result) : result;
  });

  return sorted;
}
