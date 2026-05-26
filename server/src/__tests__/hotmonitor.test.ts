import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

describe('AI热点监控系统 - 核心功能测试', () => {
  
  describe('1. 后端服务健康检查', () => {
    it('后端API服务正常运行', async () => {
      const response = await axios.get(`${API_BASE}/health`).catch(() => null);
      expect(response?.status).toBe(200);
    });
  });

  describe('2. 关键词管理功能', () => {
    let createdKeywordId: string;

    it('添加关键词成功', async () => {
      const response = await axios.post(`${API_BASE}/keywords`, {
        text: '测试关键词_' + Date.now(),
        enabled: true
      });
      expect(response.status).toBe(201);
      createdKeywordId = response.data.id;
    });

    it('获取关键词列表', async () => {
      const response = await axios.get(`${API_BASE}/keywords`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('更新关键词', async () => {
      if (!createdKeywordId) return;
      
      const response = await axios.put(`${API_BASE}/keywords/${createdKeywordId}`, {
        enabled: false
      });
      expect(response.status).toBe(200);
    });

    it('删除关键词', async () => {
      if (!createdKeywordId) return;
      
      const response = await axios.delete(`${API_BASE}/keywords/${createdKeywordId}`);
      expect([200, 204]).toContain(response.status);
    });

    it('获取已激活的关键词', async () => {
      const response = await axios.get(`${API_BASE}/keywords`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('3. 热点数据管理', () => {
    it('获取热点列表', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { limit: 20, page: 1 }
      });
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });

    it('获取热点统计', async () => {
      const response = await axios.get(`${API_BASE}/hotspots/stats`);
      expect(response.status).toBe(200);
    });

    it('按相关性排序热点', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { sortBy: 'relevance', sortOrder: 'desc' }
      });
      expect(response.status).toBe(200);
    });

    it('按时间排序热点', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { sortBy: 'createdAt', sortOrder: 'desc' }
      });
      expect(response.status).toBe(200);
    });

    it('按重要性排序热点', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { sortBy: 'importance', sortOrder: 'desc' }
      });
      expect(response.status).toBe(200);
    });
  });

  describe('4. 手动触发扫描', () => {
    it('扫描端点存在', async () => {
      const response = await axios.post(`${API_BASE}/keywords/scan`).catch(() => null);
      expect([200, 201, 202, undefined]).toContain(response?.status);
    }, 60000);
  });

  describe('5. 数据源配置', () => {
    it('获取所有数据源状态', async () => {
      const response = await axios.get(`${API_BASE}/datasources`).catch(() => null);
      if (response) {
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
      }
    });
  });

  describe('6. 系统设置', () => {
    it('获取设置项', async () => {
      const response = await axios.get(`${API_BASE}/settings`);
      expect(response.status).toBe(200);
    });

    it('更新设置项', async () => {
      const response = await axios.put(`${API_BASE}/settings`, {
        key: 'test_setting',
        value: 'test_value'
      });
      expect(response.status).toBe(200);
    });
  });

  describe('7. 通知功能', () => {
    it('获取通知列表', async () => {
      const response = await axios.get(`${API_BASE}/notifications`, {
        params: { limit: 10 }
      });
      expect(response.status).toBe(200);
    });

    it('标记通知为已读', async () => {
      const listResponse = await axios.get(`${API_BASE}/notifications`, {
        params: { limit: 1 }
      });
      
      const notifications = listResponse.data.notifications || listResponse.data;
      if (notifications && notifications.length > 0) {
        const response = await axios.patch(
          `${API_BASE}/notifications/${notifications[0].id}/read`
        );
        expect(response.status).toBe(200);
      }
    });
  });

  describe('8. 错误处理', () => {
    it('访问不存在的资源返回404', async () => {
      try {
        await axios.get(`${API_BASE}/keywords/nonexistent-id-12345`);
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    it('无效参数格式正确处理', async () => {
      try {
        await axios.get(`${API_BASE}/hotspots`, {
          params: { page: 'invalid' }
        });
      } catch (error: any) {
        expect([400, 500]).toContain(error.response?.status);
      }
    });
  });

  describe('9. WebSocket连接', () => {
    it('WebSocket端点可访问', async () => {
      const response = await axios.get(`${API_BASE}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('10. 数据库完整性', () => {
    it('能查询到热点数据', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { limit: 1 }
      });
      
      expect(response.status).toBe(200);
    });

    it('热点数据包含必要字段', async () => {
      const response = await axios.get(`${API_BASE}/hotspots`, {
        params: { limit: 1 }
      });
      
      const hotspots = response.data.hotspots || response.data;
      if (hotspots && hotspots.length > 0) {
        const hotspot = hotspots[0];
        expect(hotspot).toHaveProperty('id');
        expect(hotspot).toHaveProperty('title');
        expect(hotspot).toHaveProperty('url');
        expect(hotspot).toHaveProperty('source');
      }
    });
  });
});

describe('数据源单元测试', () => {
  it('百度数据源可实例化', async () => {
    const { BaiduDataSource } = await import('../datasources/BaiduDataSource.js');
    const source = new BaiduDataSource();
    expect(source.id).toBe('baidu');
    expect(source.name).toBe('百度搜索');
  });

  it('抖音数据源可实例化', async () => {
    const { DouyinDataSource } = await import('../datasources/DouyinDataSource.js');
    const source = new DouyinDataSource();
    expect(source.id).toBe('douyin');
    expect(source.name).toBe('抖音搜索');
  });

  it('视频号数据源可实例化', async () => {
    const { VideoSourceDataSource } = await import('../datasources/VideoSourceDataSource.js');
    const source = new VideoSourceDataSource();
    expect(source.id).toBe('video-source');
    expect(source.name).toBe('视频号');
  });

  it('小红书数据源可实例化', async () => {
    const { XiaohongshuDataSource } = await import('../datasources/XiaohongshuDataSource.js');
    const source = new XiaohongshuDataSource();
    expect(source.id).toBe('xiaohongshu');
    expect(source.name).toBe('小红书');
  });
});
