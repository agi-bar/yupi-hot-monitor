import { Router } from 'express';
import { prisma } from '../db.js';
import { dataSourceManager } from '../datasources/DataSourceManager.js';
import { sanitizeSource, sanitizeSources } from '../middleware/sanitizeResponse.js';
import { logError, logInfo } from '../utils/logger.js';
import { sourceEvents } from '../events/sourceEvents.js';

const router = Router();

// 获取所有来源
router.get('/', async (req, res) => {
  try {
    const { 
      page = '1', 
      limit = '20', 
      type, 
      category,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // 分页参数验证与边界处理
    let pageNum = parseInt(page as string);
    let limitNum = parseInt(limit as string);
    
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
    
    // 限制每页条数的合理范围
    const MIN_PAGE_SIZE = 1;
    const MAX_PAGE_SIZE = 100;
    if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
    if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;

    // 搜索参数长度限制
    const MAX_SEARCH_LENGTH = 200;
    if (search && typeof search === 'string' && search.length > MAX_SEARCH_LENGTH) {
      return res.status(400).json({ error: `Search query too long (max ${MAX_SEARCH_LENGTH} characters)` });
    }

    // 构建查询条件
    const where: any = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    // 页码越界处理（需要先查询总数）
    let adjustedPageNum = pageNum;
    const total = await prisma.source.count({ where });
    const totalPages = Math.ceil(total / limitNum);
    if (adjustedPageNum > totalPages && totalPages > 0) {
      adjustedPageNum = totalPages;
    }
    const skip = (adjustedPageNum - 1) * limitNum;

    // 排序字段白名单校验
    const allowedSortFields = ['createdAt', 'name', 'priority', 'totalRequests', 'successCount'];
    const validSortBy = allowedSortFields.includes(sortBy as string) ? sortBy : 'createdAt';
    
    // 排序
    const orderBy: any = {};
    orderBy[validSortBy as string] = sortOrder === 'asc' ? 'asc' : 'desc';

    // 查询数据（使用已查询的total）
    const sources = await prisma.source.findMany({
      where,
      orderBy,
      skip,
      take: limitNum,
      include: {
        _count: {
          select: { hotspots: true }
        }
      }
    });

    // 计算统计数据
    const stats = await prisma.source.aggregate({
      _sum: {
        totalRequests: true,
        successCount: true,
        errorCount: true
      }
    });

    res.json({
      data: sanitizeSources(sources.map(s => ({
        ...s,
        hotspotCount: s._count.hotspots
      }))),
      stats: {
        totalRequests: stats._sum.totalRequests || 0,
        successCount: stats._sum.successCount || 0,
        errorCount: stats._sum.errorCount || 0
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logError('sources.list', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// 获取单个来源详情
router.get('/:id', async (req, res) => {
  try {
    const source = await prisma.source.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { hotspots: true }
        },
        hotspots: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            createdAt: true,
            importance: true
          }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // 获取该来源的统计信息
    const stats = await prisma.hotspot.groupBy({
      by: ['importance'],
      where: { sourceRecordId: req.params.id },
      _count: true
    });

    res.json(sanitizeSource({
      ...source,
      hotspotCount: source._count.hotspots,
      importanceStats: stats
    }));
  } catch (error) {
    logError('sources.get', error);
    res.status(500).json({ error: 'Failed to fetch source' });
  }
});

// 创建来源
router.post('/', async (req, res) => {
  try {
    const {
      name,
      type,
      dataSourceId,
      category,
      description,
      config,
      priority = 0,
      isPublic = true,
      allowedRoles
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const resolvedDataSourceId = dataSourceId || type;

    if (!dataSourceManager.isValidType(resolvedDataSourceId)) {
      return res.status(400).json({ 
        error: 'Invalid source type',
        validTypes: dataSourceManager.getRegisteredTypes()
      });
    }

    try {
      const source = await prisma.source.create({
        data: {
          name,
          type,
          dataSourceId: resolvedDataSourceId,
          category,
          description,
          config: config ? JSON.stringify(config) : null,
          priority,
          isPublic,
          allowedRoles: allowedRoles ? JSON.stringify(allowedRoles) : null
        }
      });

      sourceEvents.emitCreated({
        id: source.id,
        name: source.name,
        type: source.type,
        dataSourceId: source.dataSourceId,
        status: source.status,
        config: config || null
      });

      logInfo('sources.create', `Created source ${source.dataSourceId} (${source.name}), event emitted for DataSourceManager sync`);

      res.status(201).json(sanitizeSource(source));
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        return res.status(400).json({ error: 'Source name already exists' });
      }
      logError('sources.create', error);
      res.status(500).json({ error: 'Failed to create source' });
    }
  } catch (error) {
    logError('sources.create', error);
    res.status(500).json({ error: 'Failed to create source' });
  }
});

// 更新来源
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      type,
      dataSourceId,
      category,
      status,
      description,
      config,
      priority,
      isPublic,
      allowedRoles
    } = req.body;

    const resolvedDataSourceId = dataSourceId || type;
    
    if (resolvedDataSourceId && !dataSourceManager.isValidType(resolvedDataSourceId)) {
      return res.status(400).json({ 
        error: 'Invalid source dataSourceId or type',
        validTypes: dataSourceManager.getRegisteredTypes()
      });
    }

    try {
      const source = await prisma.source.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(type && { type }),
          ...(dataSourceId && { dataSourceId }),
          ...(category !== undefined && { category }),
          ...(status && { status }),
          ...(description !== undefined && { description }),
          ...(config && { config: JSON.stringify(config) }),
          ...(priority !== undefined && { priority }),
          ...(isPublic !== undefined && { isPublic }),
          ...(allowedRoles !== undefined && { 
            allowedRoles: allowedRoles ? JSON.stringify(allowedRoles) : null 
          })
        }
      });

      const changes: Record<string, unknown> = {};
      if (name) changes.name = name;
      if (config) changes.config = config;
      if (status) changes.status = status;
      if (dataSourceId) changes.dataSourceId = dataSourceId;

      if (Object.keys(changes).length > 0) {
        sourceEvents.emitUpdated({
          id: source.id,
          dataSourceId: source.dataSourceId,
          changes
        });
        logInfo('sources.update', `Updated source ${source.dataSourceId} (${source.name}), event emitted for DataSourceManager sync`);
      }

      res.json(sanitizeSource(source));
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        return res.status(400).json({ error: 'Source name already exists' });
      }
      if ((error as { code?: string }).code === 'P2025') {
        return res.status(404).json({ error: 'Source not found' });
      }
      logError('sources.update', error);
      res.status(500).json({ error: 'Failed to update source' });
    }
  } catch (error) {
    logError('sources.update', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// 删除来源
router.delete('/:id', async (req, res) => {
  try {
    const dbId = req.params.id;
    
    const source = await prisma.source.findUnique({
      where: { id: dbId },
      include: {
        _count: {
          select: { hotspots: true }
        }
      }
    });
    
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (source._count.hotspots > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete source with associated hotspots',
        message: `该来源关联了 ${source._count.hotspots} 条热点，请先删除关联的热点数据`,
        hotspotCount: source._count.hotspots
      });
    }
    
    await prisma.source.delete({
      where: { id: dbId }
    });

    sourceEvents.emitDeleted({
      id: source.id,
      name: source.name,
      dataSourceId: source.dataSourceId
    });
    logInfo('sources.delete', `Deleted source ${source.dataSourceId} (${source.name}), event emitted for DataSourceManager sync`);

    res.status(204).send();
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Source not found' });
    }
    logError('sources.delete', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// 批量删除
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

    const sources = await prisma.source.findMany({
      where: { id: { in: ids } },
      include: {
        _count: {
          select: { hotspots: true }
        }
      }
    });

    if (sources.length === 0) {
      return res.status(404).json({ error: 'No sources found' });
    }

    const sourcesWithHotspots = sources.filter(s => s._count.hotspots > 0);
    if (sourcesWithHotspots.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete sources with associated hotspots',
        message: `以下来源关联了热点数据，请先删除关联的热点数据`,
        sourcesWithHotspots: sourcesWithHotspots.map(s => ({
          id: s.id,
          name: s.name,
          hotspotCount: s._count.hotspots
        }))
      });
    }

    await prisma.source.deleteMany({
      where: { id: { in: ids } }
    });

    for (const source of sources) {
      sourceEvents.emitDeleted({
        id: source.id,
        name: source.name,
        dataSourceId: source.dataSourceId
      });
    }
    logInfo('sources.batchDelete', `Batch deleted ${sources.length} sources, events emitted for DataSourceManager sync`);

    res.json({ message: 'Sources deleted successfully', count: sources.length });
  } catch (error) {
    logError('sources.batchDelete', error);
    res.status(500).json({ error: 'Failed to batch delete sources' });
  }
});

// 导出来源
router.get('/export', async (req, res) => {
  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { hotspots: true }
        }
      }
    });

    const exportData = sources.map(s => ({
      name: s.name,
      type: s.type,
      category: s.category,
      status: s.status,
      priority: s.priority,
      description: s.description,
      hotspotCount: s._count.hotspots,
      stats: {
        totalRequests: s.totalRequests,
        successCount: s.successCount,
        errorCount: s.errorCount
      },
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=sources-export.json');
    res.json(exportData);
  } catch (error) {
    logError('sources.export', error);
    res.status(500).json({ error: 'Failed to export sources' });
  }
});

// 导入来源
router.post('/import', async (req, res) => {
  try {
    const { sources, apiKey } = req.body;

    // 验证 API key（如果配置了）
    if (process.env.IMPORT_API_KEY && apiKey !== process.env.IMPORT_API_KEY) {
      return res.status(403).json({ error: 'Invalid import API key' });
    }

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'Sources array is required' });
    }

    // 限制单次导入数量
    const MAX_IMPORT_COUNT = 100;
    if (sources.length > MAX_IMPORT_COUNT) {
      return res.status(400).json({ 
        error: `Too many sources (max ${MAX_IMPORT_COUNT})` 
      });
    }

    // P0: 导入前校验 - 检查type唯一性
    const typeCount = new Map<string, number>();
    const nameCount = new Map<string, number>();
    
    for (const source of sources) {
      if (!source.name || !source.type) continue;
      
      typeCount.set(source.type, (typeCount.get(source.type) || 0) + 1);
      nameCount.set(source.name, (nameCount.get(source.name) || 0) + 1);
    }
    
    // 检查导入数据内部的type重复
    const internalTypeDuplicates = [...typeCount.entries()]
      .filter(([_, count]) => count > 1)
      .map(([type]) => type);
    
    if (internalTypeDuplicates.length > 0) {
      return res.status(400).json({ 
        error: 'IMPORT_TYPE_DUPLICATE',
        message: '批量导入中存在重复的type字段',
        duplicateTypes: internalTypeDuplicates,
        details: '每个type只能导入一次'
      });
    }
    
    // 检查与现有数据库的type冲突
    for (const [type] of typeCount) {
      const existing = await prisma.source.findFirst({ where: { type } });
      if (existing) {
        return res.status(400).json({ 
          error: 'IMPORT_TYPE_EXISTS',
          message: `type='${type}'已存在于来源'${existing.name}'`,
          existingSource: {
            id: existing.id,
            name: existing.name,
            type: existing.type
          },
          suggestion: '请使用唯一的type值或先删除现有来源'
        });
      }
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const source of sources) {
      try {
        // 验证每个来源的必要字段
        if (!source.name || !source.type) {
          results.failed++;
          results.errors.push(`Invalid source: missing name or type`);
          continue;
        }

        const resolvedDataSourceId = source.dataSourceId || source.type;
        
        if (!dataSourceManager.isValidType(resolvedDataSourceId)) {
          results.failed++;
          results.errors.push(`Invalid dataSourceId or type '${resolvedDataSourceId}' for ${source.name}. Valid types: ${dataSourceManager.getRegisteredTypes().join(', ')}`);
          continue;
        }

        const upserted = await prisma.source.upsert({
          where: { name: source.name },
          update: {
            type: source.type,
            dataSourceId: resolvedDataSourceId,
            category: source.category,
            status: source.status,
            priority: source.priority,
            description: source.description
          },
          create: {
            name: source.name,
            type: source.type,
            dataSourceId: resolvedDataSourceId,
            category: source.category,
            status: source.status || 'active',
            priority: source.priority || 0,
            description: source.description
          }
        });
        
        sourceEvents.emitCreated({
          id: upserted.id,
          name: upserted.name,
          type: upserted.type,
          dataSourceId: upserted.dataSourceId,
          status: upserted.status
        });
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to import ${source.name}: ${error}`);
      }
    }

    res.json(results);
  } catch (error) {
    logError('sources.import', error);
    res.status(500).json({ error: 'Failed to import sources' });
  }
});

// 更新来源统计
router.post('/:id/stats', async (req, res) => {
  try {
    const { type, increment = 1 } = req.body;

    const updateData: Record<string, unknown> = {};
    switch (type) {
      case 'request':
        updateData.totalRequests = { increment };
        break;
      case 'success':
        updateData.successCount = { increment };
        updateData.totalRequests = { increment };
        break;
      case 'error':
        updateData.errorCount = { increment };
        updateData.totalRequests = { increment };
        break;
      default:
        return res.status(400).json({ error: 'Invalid stat type' });
    }

    updateData.lastUsedAt = new Date();

    const source = await prisma.source.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      totalRequests: source.totalRequests,
      successCount: source.successCount,
      errorCount: source.errorCount,
      successRate: source.totalRequests > 0 
        ? ((source.successCount / source.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Source not found' });
    }
    logError('sources.updateStats', error);
    res.status(500).json({ error: 'Failed to update source stats' });
  }
});

// 获取来源统计报表
router.get('/:id/report', async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    let dateFrom: Date;
    const now = new Date();

    switch (period) {
      case '1d':
        dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // 获取该来源在指定时间段内的热点
    const hotspots = await prisma.hotspot.findMany({
      where: {
        sourceRecordId: req.params.id,
        createdAt: { gte: dateFrom }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 统计
    const dailyStats = new Map<string, { total: number; byImportance: Record<string, number> }>();
    
    for (const hotspot of hotspots) {
      const dateKey = hotspot.createdAt.toISOString().split('T')[0];
      
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, { total: 0, byImportance: {} });
      }
      
      const stats = dailyStats.get(dateKey)!;
      stats.total++;
      stats.byImportance[hotspot.importance] = (stats.byImportance[hotspot.importance] || 0) + 1;
    }

    // 转换为数组
    const timeline = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        ...stats
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 按重要性统计
    const importanceDistribution = hotspots.reduce((acc, h) => {
      acc[h.importance] = (acc[h.importance] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      period,
      dateFrom,
      dateTo: now,
      summary: {
        totalHotspots: hotspots.length,
        avgPerDay: (hotspots.length / (period === '1d' ? 1 : period === '7d' ? 7 : 30)).toFixed(2)
      },
      timeline,
      importanceDistribution,
      topHotspots: hotspots.slice(0, 10)
    });
  } catch (error) {
    logError('sources.report', error);
    res.status(500).json({ error: 'Failed to generate source report' });
  }
});

// 重新加载DataSourceManager配置
router.post('/reload-datasources', async (req, res) => {
  try {
    await dataSourceManager.reload();
    res.json({ message: 'DataSourceManager reloaded successfully' });
  } catch (error) {
    logError('sources.reload', error);
    res.status(500).json({ error: 'Failed to reload DataSourceManager' });
  }
});

export default router;
