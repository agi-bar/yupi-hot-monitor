import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db.js';

describe('来源管理模块测试', () => {
  describe('来源 CRUD 操作', () => {
    let testSourceId: string;

    afterEach(async () => {
      if (testSourceId) {
        await prisma.source.delete({ where: { id: testSourceId } }).catch(() => {});
      }
    });

    it('创建来源', async () => {
      const source = await prisma.source.create({
        data: {
          name: 'Test Source',
          type: 'twitter',
          dataSourceId: 'twitter',
          category: 'social',
          description: 'Test description',
          status: 'active',
          priority: 1
        }
      });

      expect(source.name).toBe('Test Source');
      expect(source.type).toBe('twitter');
      expect(source.category).toBe('social');
      expect(source.status).toBe('active');
      expect(source.id).toBeDefined();

      testSourceId = source.id;
    });

    it('查询来源列表', async () => {
      const sources = await prisma.source.findMany({
        orderBy: { createdAt: 'desc' }
      });

      expect(Array.isArray(sources)).toBe(true);
    });

    it('查询单个来源', async () => {
      const created = await prisma.source.create({
        data: {
          name: 'Query Test Source',
          type: 'bing',
          dataSourceId: 'bing',
          status: 'active'
        }
      });

      const source = await prisma.source.findUnique({
        where: { id: created.id }
      });

      expect(source).not.toBeNull();
      expect(source?.name).toBe('Query Test Source');

      testSourceId = created.id;
    });

    it('更新来源', async () => {
      const created = await prisma.source.create({
        data: {
          name: 'Update Test Source',
          type: 'google',
          dataSourceId: 'google',
          status: 'active'
        }
      });

      const updated = await prisma.source.update({
        where: { id: created.id },
        data: {
          status: 'paused',
          priority: 5
        }
      });

      expect(updated.status).toBe('paused');
      expect(updated.priority).toBe(5);

      testSourceId = created.id;
    });

    it('删除来源', async () => {
      const created = await prisma.source.create({
        data: {
          name: 'Delete Test Source',
          type: 'weibo',
          dataSourceId: 'weibo',
          status: 'active'
        }
      });

      await prisma.source.delete({
        where: { id: created.id }
      });

      const deleted = await prisma.source.findUnique({
        where: { id: created.id }
      });

      expect(deleted).toBeNull();
    });

    it('来源名称唯一性约束', async () => {
      await prisma.source.create({
        data: {
          name: 'Unique Test Source',
          type: 'twitter',
          dataSourceId: 'twitter_unique_1',
          status: 'active'
        }
      });

      await expect(
        prisma.source.create({
          data: {
            name: 'Unique Test Source',
            type: 'bing',
            dataSourceId: 'bing_unique_1',
            status: 'active'
          }
        })
      ).rejects.toThrow();

      const sources = await prisma.source.findMany({
        where: { name: 'Unique Test Source' }
      });
      await prisma.source.delete({ where: { id: sources[0].id } });
    });
  });

  describe('来源统计功能', () => {
    let testSourceId: string;

    beforeEach(async () => {
      const source = await prisma.source.create({
        data: {
          name: `Stats Test Source ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_stats_${Date.now()}`,
          status: 'active'
        }
      });
      testSourceId = source.id;
    });

    afterEach(async () => {
      if (testSourceId) {
        await prisma.source.delete({ where: { id: testSourceId } }).catch(() => {});
      }
    });

    it('更新请求统计', async () => {
      const updated = await prisma.source.update({
        where: { id: testSourceId },
        data: {
          totalRequests: { increment: 10 }
        }
      });

      expect(updated.totalRequests).toBe(10);
    });

    it('更新成功统计', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          totalRequests: 100,
          successCount: { increment: 5 }
        }
      });

      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      expect(source?.successCount).toBe(5);
    });

    it('更新错误统计', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          totalRequests: 100,
          errorCount: { increment: 3 }
        }
      });

      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      expect(source?.errorCount).toBe(3);
    });

    it('计算成功率', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          totalRequests: 100,
          successCount: 95,
          errorCount: 5
        }
      });

      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      const successRate = source && source.totalRequests > 0
        ? (source.successCount / source.totalRequests) * 100
        : 0;

      expect(successRate).toBe(95);
    });

    it('聚合统计查询', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          totalRequests: 1000,
          successCount: 950,
          errorCount: 50
        }
      });

      const stats = await prisma.source.aggregate({
        _sum: {
          totalRequests: true,
          successCount: true,
          errorCount: true
        }
      });

      expect(stats._sum.totalRequests).toBe(1000);
      expect(stats._sum.successCount).toBe(950);
      expect(stats._sum.errorCount).toBe(50);
    });
  });

  describe('来源分类管理', () => {
    let sourceIds: string[] = [];

    afterEach(async () => {
      for (const id of sourceIds) {
        await prisma.source.delete({ where: { id } }).catch(() => {});
      }
      sourceIds = [];
    });

    it('按分类查询来源', async () => {
      const sources = await Promise.all([
        prisma.source.create({
          data: { name: `Social ${Date.now()}`, type: 'twitter', dataSourceId: `twitter_${Date.now()}`, category: 'social' }
        }),
        prisma.source.create({
          data: { name: `Search ${Date.now()}`, type: 'bing', dataSourceId: `bing_${Date.now()}`, category: 'search' }
        })
      ]);

      sourceIds = sources.map(s => s.id);

      const socialSources = await prisma.source.findMany({
        where: { category: 'social' }
      });

      expect(socialSources.every(s => s.category === 'social')).toBe(true);
    });

    it('按类型查询来源', async () => {
      const sources = await Promise.all([
        prisma.source.create({
          data: { name: `Twitter ${Date.now()}`, type: 'twitter', dataSourceId: `twitter_type_${Date.now()}` }
        }),
        prisma.source.create({
          data: { name: `Bing ${Date.now()}`, type: 'bing', dataSourceId: `bing_type_${Date.now()}` }
        })
      ]);

      sourceIds = sources.map(s => s.id);

      const twitterSources = await prisma.source.findMany({
        where: { type: 'twitter' }
      });

      expect(twitterSources.every(s => s.type === 'twitter')).toBe(true);
    });
  });

  describe('来源状态管理', () => {
    let testSourceId: string;

    beforeEach(async () => {
      const source = await prisma.source.create({
        data: {
          name: `Status Test ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_status_${Date.now()}`,
          status: 'active'
        }
      });
      testSourceId = source.id;
    });

    afterEach(async () => {
      if (testSourceId) {
        await prisma.source.delete({ where: { id: testSourceId } }).catch(() => {});
      }
    });

    it('启用来源', async () => {
      const source = await prisma.source.update({
        where: { id: testSourceId },
        data: { status: 'active' }
      });

      expect(source.status).toBe('active');
    });

    it('暂停来源', async () => {
      const source = await prisma.source.update({
        where: { id: testSourceId },
        data: { status: 'paused' }
      });

      expect(source.status).toBe('paused');
    });

    it('标记来源错误', async () => {
      const source = await prisma.source.update({
        where: { id: testSourceId },
        data: { status: 'error' }
      });

      expect(source.status).toBe('error');
    });

    it('按状态筛选来源', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: { status: 'paused' }
      });

      const activeSources = await prisma.source.findMany({
        where: { status: 'active' }
      });

      expect(activeSources.every(s => s.status === 'active')).toBe(true);
    });
  });

  describe('来源权限配置', () => {
    let testSourceId: string;

    beforeEach(async () => {
      const source = await prisma.source.create({
        data: {
          name: `Permission Test ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_perm_${Date.now()}`,
          isPublic: true,
          allowedRoles: JSON.stringify(['admin', 'editor'])
        }
      });
      testSourceId = source.id;
    });

    afterEach(async () => {
      if (testSourceId) {
        await prisma.source.delete({ where: { id: testSourceId } }).catch(() => {});
      }
    });

    it('设置公开来源', async () => {
      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      expect(source?.isPublic).toBe(true);
    });

    it('设置私有来源', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: { isPublic: false }
      });

      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      expect(source?.isPublic).toBe(false);
    });

    it('配置允许的角色', async () => {
      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      const roles = source?.allowedRoles ? JSON.parse(source.allowedRoles) : [];
      expect(roles).toContain('admin');
      expect(roles).toContain('editor');
    });

    it('更新允许的角色', async () => {
      await prisma.source.update({
        where: { id: testSourceId },
        data: { allowedRoles: JSON.stringify(['viewer']) }
      });

      const source = await prisma.source.findUnique({
        where: { id: testSourceId }
      });

      const roles = source?.allowedRoles ? JSON.parse(source.allowedRoles) : [];
      expect(roles).toContain('viewer');
    });
  });

  describe('来源与热点关联', () => {
    let testSourceId: string;
    let testHotspotId: string;

    afterEach(async () => {
      if (testHotspotId) {
        await prisma.hotspot.delete({ where: { id: testHotspotId } }).catch(() => {});
      }
      if (testSourceId) {
        await prisma.source.delete({ where: { id: testSourceId } }).catch(() => {});
      }
    });

    it('创建关联热点', async () => {
      const source = await prisma.source.create({
        data: {
          name: `Hotspot Test ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_hotspot_${Date.now()}`
        }
      });
      testSourceId = source.id;

      const hotspot = await prisma.hotspot.create({
        data: {
          title: 'Test Hotspot',
          content: 'Test Content',
          url: `https://example.com/${Date.now()}`,
          source: 'twitter',
          sourceRecordId: source.id
        }
      });
      testHotspotId = hotspot.id;

      expect(hotspot.sourceRecordId).toBe(source.id);
    });

    it('查询来源的热点', async () => {
      const source = await prisma.source.create({
        data: {
          name: `Hotspots Query Test ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_query_${Date.now()}`
        }
      });
      testSourceId = source.id;

      await prisma.hotspot.create({
        data: {
          title: 'Hotspot 1',
          content: 'Content 1',
          url: `https://example.com/1-${Date.now()}`,
          source: 'twitter',
          sourceRecordId: source.id
        }
      });

      const hotspots = await prisma.hotspot.findMany({
        where: { sourceRecordId: source.id }
      });

      expect(hotspots.length).toBe(1);
      expect(hotspots[0].title).toBe('Hotspot 1');
    });

    it('统计来源的热点数量', async () => {
      const source = await prisma.source.create({
        data: {
          name: `Count Test ${Date.now()}`,
          type: 'twitter',
          dataSourceId: `twitter_count_${Date.now()}`
        }
      });
      testSourceId = source.id;

      await Promise.all([
        prisma.hotspot.create({
          data: {
            title: 'Hotspot A',
            content: 'Content A',
            url: `https://example.com/a-${Date.now()}`,
            source: 'twitter',
            sourceRecordId: source.id
          }
        }),
        prisma.hotspot.create({
          data: {
            title: 'Hotspot B',
            content: 'Content B',
            url: `https://example.com/b-${Date.now()}`,
            source: 'twitter',
            sourceRecordId: source.id
          }
        })
      ]);

      const count = await prisma.hotspot.count({
        where: { sourceRecordId: source.id }
      });

      expect(count).toBe(2);
    });
  });
});
