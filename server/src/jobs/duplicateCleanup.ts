import { prisma } from '../db.js';
import { logInfo, logError } from '../utils/logger.js';
import { getRedis } from '../utils/redis.js';
import nodeCron from 'node-cron';

const DEDUP_CACHE_PREFIX = 'hotspot:dedup:';

// 删除热点缓存过期时间：30天（添加随机抖动±1天防止缓存雪崩）
const DELETE_CACHE_BASE = 30 * 24 * 60 * 60;
const DELETE_CACHE_JITTER = 24 * 60 * 60;
const DELETE_CACHE_SECONDS = DELETE_CACHE_BASE + Math.floor(Math.random() * DELETE_CACHE_JITTER);

interface CleanupResult {
  table: string;
  removed: number;
  details: any;
}

class DuplicateCleanupJob {
  private isRunning = false;
  
  async cleanupAll(): Promise<CleanupResult[]> {
    if (this.isRunning) {
      logInfo('DuplicateCleanupJob', 'Cleanup already in progress, skipping...');
      return [];
    }
    
    this.isRunning = true;
    const results: CleanupResult[] = [];
    
    try {
      logInfo('DuplicateCleanupJob', 'Starting duplicate data cleanup...');
      
      const sourceResult = await this.cleanupDuplicateSources();
      results.push(sourceResult);
      
      const hotspotResult = await this.cleanupSoftDuplicateHotspots();
      results.push(hotspotResult);
      
      const oldDataResult = await this.cleanupOldHotspots();
      results.push(oldDataResult);
      
      const totalRemoved = results.reduce((sum, r) => sum + r.removed, 0);
      logInfo('DuplicateCleanupJob', `Cleanup completed. Total removed: ${totalRemoved}`, { results });
      
      return results;
    } catch (error) {
      logError('DuplicateCleanupJob', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  async cleanupDuplicateSources(): Promise<CleanupResult> {
    try {
      const duplicates = await prisma.$queryRaw<Array<{
        type: string;
        count: bigint;
        keep_id: string;
      }>>`
        SELECT type, COUNT(*) as count, MIN(id) as keep_id
        FROM Source
        GROUP BY type
        HAVING COUNT(*) > 1
      `;
      
      let totalRemoved = 0;
      const details: Array<{type: string; removed: number}> = [];
      
      for (const dup of duplicates) {
        const removed = Number(dup.count) - 1;
        
        await prisma.source.deleteMany({
          where: {
            type: dup.type,
            NOT: { id: dup.keep_id }
          }
        });
        
        totalRemoved += removed;
        details.push({ type: dup.type, removed });
        
        logInfo('DuplicateCleanupJob', `Cleaned up ${removed} duplicate sources with type=${dup.type}`);
      }
      
      return {
        table: 'Source',
        removed: totalRemoved,
        details
      };
    } catch (error) {
      logError('DuplicateCleanupJob.cleanupDuplicateSources', error);
      throw error;
    }
  }
  
  async cleanupSoftDuplicateHotspots(softDuplicateHours: number = 24): Promise<CleanupResult> {
    try {
      const timeThreshold = new Date(Date.now() - softDuplicateHours * 60 * 60 * 1000);
      
      // 使用窗口函数一次性找出所有需要删除的记录（优化N+1查询）
      const toDelete = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH Ranked AS (
          SELECT 
            id,
            title,
            source,
            createdAt,
            ROW_NUMBER() OVER (PARTITION BY title, source ORDER BY createdAt ASC) as rn
          FROM Hotspot
          WHERE createdAt >= ${timeThreshold}
        )
        SELECT id FROM Ranked WHERE rn > 1
      `;
      
      let totalRemoved = 0;
      const details: Array<{title: string; source: string; removed: number}> = [];
      
      // 批量删除（优化多个单次删除）
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map(r => r.id);
        
        // 先查询要删除的记录信息（用于日志和缓存清理）
        const hotspotsToDelete = await prisma.hotspot.findMany({
          where: { id: { in: idsToDelete } },
          select: { id: true, title: true, source: true }
        });
        
        // 批量删除
        const result = await prisma.hotspot.deleteMany({
          where: { id: { in: idsToDelete } }
        });
        
        // 清理软去重缓存（批量操作优化）
        try {
          const pipeline = getRedis().pipeline();
          const deletedSet = new Set(idsToDelete);
          
          for (const hotspot of hotspotsToDelete) {
            if (deletedSet.has(hotspot.id)) {
              const cacheKey = `${DEDUP_CACHE_PREFIX}${hotspot.source}:${hotspot.title}`;
              pipeline.del(cacheKey);
            }
          }
          
          await pipeline.exec();
          logInfo('DuplicateCleanupJob', 
            `Cleared ${hotspotsToDelete.length} soft dedup cache entries`);
        } catch (cacheError) {
          logInfo('DuplicateCleanupJob', `Failed to clear cache for soft duplicates`);
        }
        
        totalRemoved = result.count;
        
        // 按 source 分组统计（用于日志）
        const bySource = new Map<string, number>();
        for (const hotspot of hotspotsToDelete) {
          bySource.set(hotspot.source, (bySource.get(hotspot.source) || 0) + 1);
        }
        
        for (const [source, count] of bySource.entries()) {
          details.push({
            title: `${count} items`,
            source,
            removed: count
          });
        }
        
        logInfo('DuplicateCleanupJob', 
          `Cleaned up ${totalRemoved} soft duplicate hotspots using window function (optimized)`);
      }
      
      return {
        table: 'Hotspot_soft_duplicates',
        removed: totalRemoved,
        details
      };
    } catch (error) {
      logError('DuplicateCleanupJob.cleanupSoftDuplicateHotspots', error);
      throw error;
    }
  }
  
  async cleanupOldHotspots(daysOld: number = 30): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      // 先查询要删除的记录的 source 和 title（限制数量，避免内存问题）
      const hotspotsToDelete = await prisma.hotspot.findMany({
        where: {
          importance: { notIn: ['high', 'urgent'] },
          createdAt: { lt: cutoffDate }
        },
        select: { source: true, title: true },
        take: 1000 // 限制一次处理1000条
      });
      
      // 删除数据库记录
      const result = await prisma.hotspot.deleteMany({
        where: {
          importance: { notIn: ['high', 'urgent'] },
          createdAt: { lt: cutoffDate }
        }
      });
      
      // ✅ 设置永久缓存（30天±随机），确保清理的旧数据永远不会再被抓取
      if (hotspotsToDelete.length > 0) {
        try {
          const pipeline = getRedis().pipeline();
          for (const hotspot of hotspotsToDelete) {
            const cacheKey = `${DEDUP_CACHE_PREFIX}${hotspot.source}:${hotspot.title}`;
            // 使用带随机抖动的过期时间，防止缓存雪崩
            const cacheTTL = DELETE_CACHE_BASE + Math.floor(Math.random() * DELETE_CACHE_JITTER);
            pipeline.setex(cacheKey, cacheTTL, 'deleted');
          }
          await pipeline.exec();
          logInfo('DuplicateCleanupJob', 
            `Set ${hotspotsToDelete.length} permanent dedup cache entries (${(DELETE_CACHE_BASE/86400).toFixed(0)}±${(DELETE_CACHE_JITTER/86400).toFixed(0)} days) for old hotspots`);
        } catch (cacheError) {
          logInfo('DuplicateCleanupJob', `Failed to set permanent cache for old hotspots`);
        }
      }
      
      logInfo('DuplicateCleanupJob', 
        `Cleaned up ${result.count} old hotspots (older than ${daysOld} days, excluding high/urgent)`);
      
      return {
        table: 'Hotspot_old',
        removed: result.count,
        details: { daysOld, cutoffDate: cutoffDate.toISOString() }
      };
    } catch (error) {
      logError('DuplicateCleanupJob.cleanupOldHotspots', error);
      throw error;
    }
  }
  
  startScheduledCleanup() {
    const cronExpression = '0 3 * * 0';
    
    if (!nodeCron.validate(cronExpression)) {
      logError('DuplicateCleanupJob', new Error('Invalid cron expression'));
      return;
    }
    
    nodeCron.schedule(cronExpression, async () => {
      try {
        logInfo('DuplicateCleanupJob', 'Running scheduled cleanup...');
        await this.cleanupAll();
      } catch (error) {
        logError('DuplicateCleanupJob', error);
      }
    });
    
    logInfo('DuplicateCleanupJob', 'Scheduled cleanup job started (runs every Sunday at 3 AM)');
  }
  
  async getDataQualityReport() {
    const report = {
      timestamp: new Date(),
      sourceDuplicates: await this.getSourceDuplicates(),
      hotspotSoftDuplicates: await this.getHotspotSoftDuplicates(),
      dataStats: await this.getDataStats()
    };
    
    return report;
  }
  
  private async getSourceDuplicates() {
    const duplicates = await prisma.$queryRaw<Array<{
      type: string;
      count: bigint;
    }>>`
      SELECT type, COUNT(*) as count
      FROM Source
      GROUP BY type
      HAVING COUNT(*) > 1
    `;
    
    return {
      hasDuplicates: duplicates.length > 0,
      duplicateTypes: duplicates.map(d => ({ type: d.type, count: Number(d.count) })),
      totalDuplicates: duplicates.reduce((sum, d) => sum + (Number(d.count) - 1), 0)
    };
  }
  
  private async getHotspotSoftDuplicates() {
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const duplicates = await prisma.$queryRaw<Array<{
      title: string;
      source: string;
      count: bigint;
    }>>`
      SELECT title, source, COUNT(*) as count
      FROM Hotspot
      WHERE createdAt >= ${recentDate}
      GROUP BY title, source
      HAVING COUNT(*) > 5
    `;
    
    return {
      hasDuplicates: duplicates.length > 0,
      highDuplicateGroups: duplicates.map(d => ({ title: d.title, source: d.source, count: Number(d.count) })),
      totalSoftDuplicates: duplicates.reduce((sum, d) => sum + (Number(d.count) - 1), 0)
    };
  }
  
  private async getDataStats() {
    const [sourceCount, hotspotCount, keywordCount, notificationCount] = await Promise.all([
      prisma.source.count(),
      prisma.hotspot.count(),
      prisma.keyword.count(),
      prisma.notification.count()
    ]);
    
    return {
      sourceCount,
      hotspotCount,
      keywordCount,
      notificationCount
    };
  }
}

export const duplicateCleanupJob = new DuplicateCleanupJob();
