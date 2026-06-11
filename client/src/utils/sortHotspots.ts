/**
 * 热点排序工具函数（前端版本，与 server/src/utils/sortHotspots.ts 逻辑一致）
 *
 * 热度综合公式：
 *   likes×2 + retweets×3 + replies×1.5 + comments×1.5 + quotes×2 + log10(views+1)×5
 *   log 压缩浏览量避免淹没互动指标
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
  createdAt: Date | string;
}

export const IMPORTANCE_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * 计算热度原始分数（加权求和，与后端一致）
 * 浏览量使用 log10 压缩，系数 5
 */
export function calcHotScoreRaw(item: SortableHotspot): number {
  const likes = item.likeCount || 0;
  const retweets = item.retweetCount || 0;
  const replies = item.replyCount || 0;
  const comments = item.commentCount || 0;
  const quotes = item.quoteCount || 0;
  const views = item.viewCount || 0;

  const viewScore = views > 0 ? Math.log10(views + 1) * 5 : 0;

  return likes * 2 + retweets * 3 + replies * 1.5 + comments * 1.5 + quotes * 2 + viewScore;
}

/**
 * 归一化到 0-100（log 压缩）
 */
export function normalizeHotScore(raw: number): number {
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}

/**
 * 计算热度综合分数（原始分数，用于排序比较）
 */
export function calcHotScore(item: SortableHotspot): number {
  return calcHotScoreRaw(item);
}

export function compareImportance(a: SortableHotspot, b: SortableHotspot): number {
  return (IMPORTANCE_ORDER[a.importance] ?? 4) - (IMPORTANCE_ORDER[b.importance] ?? 4);
}

function toTimestamp(d: Date | string | null): number {
  if (!d) return 0;
  return typeof d === 'string' ? new Date(d).getTime() : d.getTime();
}

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
