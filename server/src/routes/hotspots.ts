/**
 * 热点路由
 * 优化:
 * 1. 使用 asyncHandler 自动捕获异常
 * 2. 使用 validators 清洗所有 query/body 输入
 * 3. 内存排序只取当前页需要的量（避免先排序再分页）
 */
import { Router } from 'express';
import { prisma } from '../db.js';
import { sortHotspots } from '../utils/sortHotspots.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import {
  parsePagination,
  validateImportance,
  validateSource,
  validateTimeRange,
  validateBoolString,
  validateSortBy,
  validateSortOrder
} from '../utils/validators.js';

const idOf = (req: { params: Record<string, string | string[] | undefined> }): string => {
  const v = req.params.id;
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
};

const router = Router();

/**
 * GET /api/hotspots
 * 支持: 分页、筛选（来源/重要程度/关键词/时间/真实性）、排序
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as any);
  const source = validateSource(req.query.source);
  const importance = validateImportance(req.query.importance);
  const keywordId = typeof req.query.keywordId === 'string' ? req.query.keywordId : '';
  const isReal = validateBoolString(req.query.isReal);
  const timeRange = validateTimeRange(req.query.timeRange);
  const timeFrom = typeof req.query.timeFrom === 'string' ? req.query.timeFrom : '';
  const timeTo = typeof req.query.timeTo === 'string' ? req.query.timeTo : '';
  const sortBy = validateSortBy(req.query.sortBy);
  const sortOrder = validateSortOrder(req.query.sortOrder);

  const where: any = {};
  if (source) where.source = source;
  if (importance) where.importance = importance;
  if (keywordId) where.keywordId = keywordId;
  if (isReal) where.isReal = isReal === 'true';

  if (timeRange) {
    const now = new Date();
    let dateFrom: Date | null = null;
    switch (timeRange) {
      case '1h': dateFrom = new Date(now.getTime() - 60 * 60 * 1000); break;
      case 'today': dateFrom = new Date(now); dateFrom.setHours(0, 0, 0, 0); break;
      case '7d': dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    }
    if (dateFrom) where.createdAt = { gte: dateFrom };
  } else if (timeFrom || timeTo) {
    where.createdAt = {};
    if (timeFrom) where.createdAt.gte = new Date(timeFrom);
    if (timeTo) where.createdAt.lte = new Date(timeTo);
  }

  // importance/hot 排序 Prisma 不支持，标记需要内存排序
  const needsMemorySort = sortBy === 'importance' || sortBy === 'hot';
  const order = sortOrder === 'asc' ? 'asc' : 'desc';

  let orderBy: any;
  switch (sortBy) {
    case 'publishedAt':
      orderBy = [{ publishedAt: order }, { createdAt: 'desc' }];
      break;
    case 'relevance':
      orderBy = { relevance: order };
      break;
    default:
      orderBy = { createdAt: order };
  }

  // 内存排序时用 take=skip+limit 取到足够数据，避免加载全部
  const dbTake = needsMemorySort ? skip + limit : limit;

  const [rawHotspots, total] = await Promise.all([
    prisma.hotspot.findMany({
      where,
      orderBy,
      ...(needsMemorySort ? {} : { skip, take: limit }),
      include: { keyword: { select: { id: true, text: true, category: true } } }
    }),
    prisma.hotspot.count({ where })
  ]);

  let hotspots;
  if (needsMemorySort) {
    const sorted = sortHotspots(rawHotspots, sortBy, order);
    hotspots = sorted.slice(skip, skip + limit);
  } else {
    hotspots = rawHotspots;
  }

  res.json({
    data: hotspots,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
}));

/**
 * GET /api/hotspots/stats - 统计数据
 */
router.get('/stats', asyncHandler(async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalHotspots, todayHotspots, urgentHotspots, sourceStats] = await Promise.all([
    prisma.hotspot.count(),
    prisma.hotspot.count({ where: { createdAt: { gte: today } } }),
    prisma.hotspot.count({ where: { importance: 'urgent' } }),
    prisma.hotspot.groupBy({ by: ['source'], _count: { source: true } })
  ]);

  const bySource = sourceStats.reduce<Record<string, number>>((acc, item) => {
    acc[item.source] = item._count.source;
    return acc;
  }, {});

  res.json({ total: totalHotspots, today: todayHotspots, urgent: urgentHotspots, bySource });
}));

/**
 * GET /api/hotspots/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const hotspot = await prisma.hotspot.findUnique({
    where: { id: idOf(req) },
    include: { keyword: true }
  });
  if (!hotspot) throw new HttpError(404, 'Hotspot not found');
  res.json(hotspot);
}));

/**
 * POST /api/hotspots/search - 手动搜索
 */
router.post('/search', asyncHandler(async (req, res) => {
  const { query, sources = ['twitter', 'bing', 'hackernews', 'duckduckgo', 'sogou', 'bilibili', 'weibo'] } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new HttpError(400, 'Query is required');
  }
  const cleanQuery = query.trim().slice(0, 200);

  const validSources = Array.isArray(sources)
    ? sources.filter(s => ['twitter', 'bing', 'hackernews', 'duckduckgo', 'sogou', 'bilibili', 'weibo'].includes(s))
    : ['twitter', 'bing'];

  const { searchTwitter } = await import('../services/twitter.js');
  const { searchBing, searchHackerNews, searchDuckDuckGo } = await import('../services/search.js');
  const { searchSogou, searchBilibili, searchWeibo } = await import('../services/chinaSearch.js');
  const { analyzeContent } = await import('../services/ai.js');

  const results: any[] = [];

  const sourceHandlers: Record<string, () => Promise<any[]>> = {
    twitter: () => searchTwitter(cleanQuery),
    bing: () => searchBing(cleanQuery),
    hackernews: () => searchHackerNews(cleanQuery),
    duckduckgo: () => searchDuckDuckGo(cleanQuery),
    sogou: () => searchSogou(cleanQuery),
    bilibili: () => searchBilibili(cleanQuery),
    weibo: () => searchWeibo(cleanQuery)
  };

  for (const source of validSources) {
    const handler = sourceHandlers[source];
    if (!handler) continue;
    try {
      const items = await handler();
      results.push(...items);
    } catch (error) {
      console.error(`${source} search failed:`, error);
    }
  }

  const analyzedResults = await Promise.all(
    results.slice(0, 10).map(async (item) => {
      try {
        const analysis = await analyzeContent(item.title + ' ' + item.content, cleanQuery);
        return { ...item, analysis };
      } catch {
        return { ...item, analysis: null };
      }
    })
  );

  res.json({ results: analyzedResults });
}));

/**
 * DELETE /api/hotspots/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.hotspot.delete({ where: { id: idOf(req) } });
  res.status(204).send();
}));

export default router;
