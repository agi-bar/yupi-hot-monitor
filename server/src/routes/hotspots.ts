import { Router } from 'express';
import { prisma } from '../db.js';
import { sortHotspots } from '../utils/sortHotspots.js';
import { getRedis } from '../utils/redis.js';
import { logInfo, logError } from '../utils/logger.js';

const router = Router();

const DEDUP_CACHE_PREFIX = 'hotspot:dedup:';

// 删除热点缓存过期时间：30天（添加随机抖动±1天防止缓存雪崩）
const DELETE_CACHE_BASE = 30 * 24 * 60 * 60;
const DELETE_CACHE_JITTER = 24 * 60 * 60;

function generateDeleteCacheTTL(): number {
  return DELETE_CACHE_BASE + Math.floor(Math.random() * DELETE_CACHE_JITTER);
}

// 获取所有热点
router.get('/', async (req, res) => {
  try {
    const { 
      page = '1', 
      limit = '20', 
      source, 
      sourceRecordId,
      importance,
      keywordId,
      isReal,
      timeRange,
      timeFrom,
      timeTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // 分页参数验证与边界处理
    let pageNum = parseInt(page as string);
    let limitNum = parseInt(limit as string);
    
    // 非法数字或负数处理
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
    
    // 限制每页条数的合理范围
    const MIN_PAGE_SIZE = 1;
    const MAX_PAGE_SIZE = 100;
    if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
    if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;

    const where: any = {};
    if (source) where.source = source;
    if (sourceRecordId) where.sourceRecordId = sourceRecordId;
    if (importance) where.importance = importance;
    if (keywordId) where.keywordId = keywordId;
    if (isReal !== undefined && isReal !== '') {
      where.isReal = isReal === 'true';
    }

    // 时间范围筛选
    if (timeRange) {
      const now = new Date();
      let dateFrom: Date | null = null;
      switch (timeRange) {
        case '1h':
          dateFrom = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'today':
          dateFrom = new Date(now);
          dateFrom.setHours(0, 0, 0, 0);
          break;
        case '7d':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      if (dateFrom) {
        where.createdAt = { gte: dateFrom };
      }
    } else if (timeFrom || timeTo) {
      where.createdAt = {};
      if (timeFrom) where.createdAt.gte = new Date(timeFrom as string);
      if (timeTo) where.createdAt.lte = new Date(timeTo as string);
    }

    // 排序处理
    let orderBy: any;
    const sort = sortBy as string;
    const order = (sortOrder as string) === 'asc' ? 'asc' : 'desc';

    // importance 和 hot 需要在内存中排序（Prisma 不支持自定义排序）
    const needsMemorySort = sort === 'importance' || sort === 'hot';

    switch (sort) {
      case 'publishedAt':
        orderBy = [{ publishedAt: order }, { createdAt: 'desc' }];
        break;
      case 'relevance':
        orderBy = { relevance: order };
        break;
      case 'importance':
      case 'hot':
        orderBy = { createdAt: 'desc' };
        break;
      default:
        orderBy = { createdAt: order };
        break;
    }

    // 先查询总数，用于处理页码越界
    const total = await prisma.hotspot.count({ where });
    
    // 计算总页数并处理页码越界
    const totalPages = Math.ceil(total / limitNum);
    if (pageNum > totalPages && totalPages > 0) {
      pageNum = totalPages;
    }
    
    const skip = (pageNum - 1) * limitNum;
    
    let hotspots;
    let warning = null;
    
    if (needsMemorySort) {
      const MAX_IN_MEMORY_SORT = 10000;
      const allHotspots = await prisma.hotspot.findMany({
        where,
        orderBy,
        take: MAX_IN_MEMORY_SORT,
        include: {
          keyword: {
            select: { id: true, text: true, category: true }
          },
          sourceRecord: {
            select: { id: true, name: true, type: true, category: true }
          }
        }
      });
      
      if (total > MAX_IN_MEMORY_SORT) {
        warning = `Memory sort limit reached. Showing top ${MAX_IN_MEMORY_SORT} of ${total} records. For complete results, use 'createdAt' sort.`;
        console.warn(`[Hotspots API] ⚠️ ${warning}`);
      }
      
      const sorted = sortHotspots(allHotspots, sort, order as 'asc' | 'desc');
      hotspots = sorted.slice(skip, skip + limitNum);
    } else {
      hotspots = await prisma.hotspot.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          keyword: {
            select: { id: true, text: true, category: true }
          },
          sourceRecord: {
            select: { id: true, name: true, type: true, category: true }
          }
        }
      });
    }

    res.json({
      data: hotspots,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      ...(warning && { warning })
    });
  } catch (error) {
    console.error('Error fetching hotspots:', error);
    res.status(500).json({ error: 'Failed to fetch hotspots' });
  }
});

// 获取热点统计
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalHotspots,
      todayHotspots,
      urgentHotspots,
      sourceStats
    ] = await Promise.all([
      prisma.hotspot.count(),
      prisma.hotspot.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.hotspot.count({
        where: { importance: 'urgent' }
      }),
      prisma.hotspot.groupBy({
        by: ['source'],
        _count: { source: true }
      })
    ]);

    res.json({
      total: totalHotspots,
      today: todayHotspots,
      urgent: urgentHotspots,
      bySource: sourceStats.reduce((acc: Record<string, number>, item: { source: string; _count: { source: number } }) => {
        acc[item.source] = item._count.source;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// 获取单个热点
router.get('/:id', async (req, res) => {
  try {
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id },
      include: {
        keyword: true
      }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    res.json(hotspot);
  } catch (error) {
    console.error('Error fetching hotspot:', error);
    res.status(500).json({ error: 'Failed to fetch hotspot' });
  }
});

// 手动搜索热点
router.post('/search', async (req, res) => {
  try {
    const { query, sources = ['twitter', 'bing'] } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // 导入搜索服务
    const { searchTwitter } = await import('../services/twitter.js');
    const { searchBing } = await import('../services/search.js');
    const { analyzeContent } = await import('../services/ai.js');

    const results: any[] = [];

    // Twitter 搜索
    if (sources.includes('twitter')) {
      try {
        const tweets = await searchTwitter(query);
        results.push(...tweets);
      } catch (error) {
        console.error('Twitter search failed:', error);
      }
    }

    // Bing 搜索
    if (sources.includes('bing')) {
      try {
        const webResults = await searchBing(query);
        results.push(...webResults);
      } catch (error) {
        console.error('Bing search failed:', error);
      }
    }

    // AI 分析前几个结果
    const analyzedResults = await Promise.all(
      results.slice(0, 10).map(async (item) => {
        try {
          const analysis = await analyzeContent(item.title + ' ' + item.content, query);
          return { ...item, analysis };
        } catch {
          return { ...item, analysis: null };
        }
      })
    );

    res.json({ results: analyzedResults });
  } catch (error) {
    console.error('Error searching hotspots:', error);
    res.status(500).json({ error: 'Failed to search hotspots' });
  }
});

// 删除热点
router.delete('/:id', async (req, res) => {
  try {
    // 先查询获取 source 和 title
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id },
      select: { source: true, title: true }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    // 删除数据库记录
    await prisma.hotspot.delete({
      where: { id: req.params.id }
    });

    // ✅ 保留去重缓存（不清理），确保删除的数据永远不会再被抓取
    // 缓存会在30天后自然过期，但用户期望是永久过滤
    // 使用带随机抖动的过期时间（30天±1天），防止缓存雪崩
    try {
      const cacheKey = `${DEDUP_CACHE_PREFIX}${hotspot.source}:${hotspot.title}`;
      const existingTTL = await getRedis().ttl(cacheKey);
      if (existingTTL < 0 || existingTTL < DELETE_CACHE_BASE) {
        const cacheTTL = generateDeleteCacheTTL();
        await getRedis().setex(cacheKey, cacheTTL, 'deleted');
        console.log(`[Hotspots API] Set permanent dedup cache (${(cacheTTL/86400).toFixed(0)} days) for: ${hotspot.source}:${hotspot.title.slice(0, 30)}...`);
      }
    } catch (cacheError) {
      console.warn('[Hotspots API] Failed to set dedup cache:', cacheError);
    }

    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Hotspot not found' });
    }
    console.error('Error deleting hotspot:', error);
    res.status(500).json({ error: 'Failed to delete hotspot' });
  }
});

// 批量删除热点
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids, confirm } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }

    if (confirm !== true) {
      return res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Please provide confirm: true to proceed with deletion'
      });
    }

    // ✅ 使用事务确保查询和删除的原子性，避免数据不一致
    const [hotspotsToDelete, result] = await prisma.$transaction([
      prisma.hotspot.findMany({
        where: { id: { in: ids } },
        select: { source: true, title: true }
      }),
      prisma.hotspot.deleteMany({
        where: { id: { in: ids } }
      })
    ]);

    // ✅ 批量设置去重缓存（30天±随机），确保删除的数据永远不会再被抓取
    try {
      const pipeline = getRedis().pipeline();
      for (const hotspot of hotspotsToDelete) {
        const cacheKey = `${DEDUP_CACHE_PREFIX}${hotspot.source}:${hotspot.title}`;
        pipeline.setex(cacheKey, generateDeleteCacheTTL(), 'deleted');
      }
      await pipeline.exec();
      console.log(`[Hotspots API] Set ${hotspotsToDelete.length} permanent dedup cache entries (${(DELETE_CACHE_BASE/86400).toFixed(0)}±${(DELETE_CACHE_JITTER/86400).toFixed(0)} days)`);
    } catch (cacheError) {
      console.warn('[Hotspots API] Failed to set dedup cache:', cacheError);
    }

    logInfo('hotspots.batchDelete', `Batch deleted ${result.count} hotspots and set permanent cache`);

    res.json({ message: 'Hotspots deleted successfully', count: result.count });
  } catch (error) {
    logError('hotspots.batchDelete', error);
    res.status(500).json({ error: 'Failed to batch delete hotspots' });
  }
});

export default router;
