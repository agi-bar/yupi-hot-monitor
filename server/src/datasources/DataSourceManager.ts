import { prisma } from '../db.js';
import type { DataSourceConfig, DataSourceMetrics, DataSourceLog, DataSourceHealth } from '../types/datasource.js';
import { BaiduDataSource } from './BaiduDataSource.js';
import { DouyinDataSource } from './DouyinDataSource.js';
import { VideoSourceDataSource } from './VideoSourceDataSource.js';
import { XiaohongshuDataSource } from './XiaohongshuDataSource.js';
import type { BaseDataSource, SearchOptions, SearchResult } from '../types/datasource.js';

class DataSourceManager {
  private sources: Map<string, BaseDataSource> = new Map();
  private configs: Map<string, DataSourceConfig> = new Map();
  private changeListeners: Array<(sourceId: string, action: 'created' | 'updated' | 'deleted') => void> = [];
  
  private static readonly BUILT_IN_SOURCE_IDS = ['baidu', 'douyin', 'video-source', 'xiaohongshu'] as const;
  
  constructor() {
    this.registerDefaultSources();
  }
  
  onSourceChange(callback: (sourceId: string, action: 'created' | 'updated' | 'deleted') => void): void {
    this.changeListeners.push(callback);
  }
  
  private notifyChange(sourceId: string, action: 'created' | 'updated' | 'deleted'): void {
    this.changeListeners.forEach(callback => {
      try {
        callback(sourceId, action);
      } catch (error) {
        console.error(`Error in source change listener:`, error);
      }
    });
  }
  
  private registerDefaultSources(): void {
    const baidu = new BaiduDataSource();
    this.sources.set('baidu', baidu);
    
    const douyin = new DouyinDataSource();
    this.sources.set('douyin', douyin);
    
    const videoSource = new VideoSourceDataSource();
    this.sources.set('video-source', videoSource);
    
    const xiaohongshu = new XiaohongshuDataSource();
    this.sources.set('xiaohongshu', xiaohongshu);
  }
  
  async initialize(): Promise<void> {
    const settings = await prisma.setting.findMany();
    
    const datasourceSettings = settings.filter(s => s.key.startsWith('datasource_'));
    const credentialSettings = settings.filter(s => s.key.startsWith('credential_'));
    
    for (const setting of datasourceSettings) {
      const sourceId = setting.key.replace('datasource_', '');
      try {
        const config = JSON.parse(setting.value) as DataSourceConfig;
        this.configs.set(sourceId, config);
        
        const source = this.sources.get(sourceId);
        if (source) {
          await source.initialize(config);
        }
      } catch (error) {
        console.error(`Failed to load datasource config for ${sourceId}:`, error);
      }
    }
    
    for (const setting of credentialSettings) {
      const sourceId = setting.key.replace('credential_', '');
      try {
        const credential = JSON.parse(setting.value);
        const source = this.sources.get(sourceId);
        const config = this.configs.get(sourceId);
        if (source && config) {
          await source.initialize(config, credential);
        }
      } catch (error) {
        console.error(`Failed to load credential for ${sourceId}:`, error);
      }
    }
    
    console.log(`DataSourceManager initialized with ${this.sources.size} sources, ${datasourceSettings.length} configs loaded`);
  }
  
  async reload(): Promise<void> {
    console.log('Reloading DataSourceManager...');
    this.configs.clear();
    await this.initialize();
    console.log('DataSourceManager reloaded successfully');
  }
  
  async search(sourceId: string, options: SearchOptions): Promise<SearchResult[]> {
    const source = this.sources.get(sourceId);
    
    if (!source) {
      throw new Error(`Unknown data source: ${sourceId}`);
    }
    
    const config = this.configs.get(sourceId);
    if (config && !config.enabled) {
      console.log(`Data source ${sourceId} is disabled`);
      return [];
    }
    
    return source.search(options);
  }
  
  async searchAll(options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    const searchPromises = Array.from(this.sources.entries())
      .filter(([id]) => {
        const config = this.configs.get(id);
        return config?.enabled !== false;
      })
      .map(async ([, source]) => {
        try {
          return await source.search(options);
        } catch (error) {
          console.error(`Search failed for ${source.id}:`, error);
          return [];
        }
      });
    
    const allResults = await Promise.all(searchPromises);
    
    for (const result of allResults) {
      results.push(...result);
    }
    
    return results;
  }
  
  getSource(sourceId: string): BaseDataSource | undefined {
    return this.sources.get(sourceId);
  }
  
  getAllSources(): BaseDataSource[] {
    return Array.from(this.sources.values());
  }
  
  getConfig(sourceId: string): DataSourceConfig | undefined {
    return this.configs.get(sourceId);
  }
  
  async updateConfig(sourceId: string, config: Partial<DataSourceConfig>): Promise<void> {
    // 严格检查：只允许更新已注册的数据源
    const source = this.sources.get(sourceId);
    if (!source) {
      const registeredTypes = Array.from(this.sources.keys());
      throw new Error(
        `Cannot update config for unregistered source: ${sourceId}. ` +
        `Registered sources: ${registeredTypes.join(', ')}`
      );
    }
    
    const existing = this.configs.get(sourceId) || {
      id: sourceId,
      name: sourceId,
      enabled: true,
      rateLimit: { requestsPerMinute: 60, requestsPerDay: 10000 },
      retry: { maxRetries: 3, retryDelayMs: 1000 },
      timeout: 30000
    };
    
    const newConfig = { ...existing, ...config };
    this.configs.set(sourceId, newConfig);
    
    await prisma.setting.upsert({
      where: { key: `datasource_${sourceId}` },
      update: { value: JSON.stringify(newConfig) },
      create: { key: `datasource_${sourceId}`, value: JSON.stringify(newConfig) }
    });
    
    await source.initialize(newConfig);
    console.log(`[DataSourceManager] ✅ Updated config for source: ${sourceId}`);
    
    this.notifyChange(sourceId, 'updated');
  }
  
  async toggleSource(sourceId: string, enabled: boolean): Promise<void> {
    await this.updateConfig(sourceId, { enabled });
  }
  
  async removeSource(sourceId: string): Promise<void> {
    if (DataSourceManager.BUILT_IN_SOURCE_IDS.includes(sourceId as any)) {
      throw new Error(`Cannot remove built-in data source: ${sourceId}. Built-in sources cannot be deleted.`);
    }
    
    const source = this.sources.get(sourceId);
    const config = this.configs.get(sourceId);
    
    if (source) {
      this.sources.delete(sourceId);
      console.log(`[DataSourceManager] ✅ Removed hardcoded source from sources map: ${sourceId}`);
    }
    
    if (config) {
      this.configs.delete(sourceId);
      console.log(`[DataSourceManager] ✅ Removed config from configs map: ${sourceId}`);
    }
    
    await prisma.setting.deleteMany({
      where: {
        key: {
          in: [`datasource_${sourceId}`, `credential_${sourceId}`]
        }
      }
    });
    
    this.notifyChange(sourceId, 'deleted');
    console.log(`[DataSourceManager] 🗑️ Removed source: ${sourceId}`);
  }
  
  async removeSources(sourceIds: string[]): Promise<void> {
    await Promise.all(sourceIds.map(id => this.removeSource(id)));
  }
  
  getMetrics(sourceId: string): DataSourceMetrics | undefined {
    const source = this.sources.get(sourceId);
    return source?.getMetrics();
  }
  
  getAllMetrics(): DataSourceMetrics[] {
    return Array.from(this.sources.values()).map(s => s.getMetrics());
  }
  
  getLogs(sourceId: string, limit?: number): DataSourceLog[] {
    const source = this.sources.get(sourceId);
    return source?.getLogs(limit) || [];
  }
  
  async healthCheck(sourceId?: string): Promise<DataSourceHealth[]> {
    const targets = sourceId 
      ? [this.sources.get(sourceId)].filter(Boolean) as BaseDataSource[]
      : Array.from(this.sources.values());
    
    const healthChecks = targets.map(async (source): Promise<DataSourceHealth> => {
      const start = Date.now();
      try {
        const isHealthy = await source.healthCheck();
        const latency = Date.now() - start;
        const metrics = source.getMetrics();
        
        return {
          id: source.id,
          status: isHealthy ? 'healthy' : 'degraded',
          latency,
          errorRate: metrics.totalRequests > 0 
            ? metrics.failedRequests / metrics.totalRequests 
            : 0,
          lastCheck: new Date()
        };
      } catch {
        return {
          id: source.id,
          status: 'unavailable',
          latency: Date.now() - start,
          errorRate: 1,
          lastCheck: new Date()
        };
      }
    });
    
    return Promise.all(healthChecks);
  }
  
  listSources(): Array<{ id: string; name: string; icon: string; enabled: boolean }> {
    return Array.from(this.sources.values()).map(source => ({
      id: source.id,
      name: source.name,
      icon: source.icon,
      enabled: this.configs.get(source.id)?.enabled ?? true
    }));
  }

  getStatus(): { sourcesCount: number; configsCount: number; sourceIds: string[]; configIds: string[] } {
    const status = {
      sourcesCount: this.sources.size,
      configsCount: this.configs.size,
      sourceIds: Array.from(this.sources.keys()),
      configIds: Array.from(this.configs.keys())
    };
    console.log(`[DataSourceManager] 📊 Status: ${status.sourcesCount} sources, ${status.configsCount} configs`);
    return status;
  }
  
  getRegisteredTypes(): string[] {
    const hardcodedTypes = Array.from(this.sources.keys());
    const dynamicTypes = Array.from(this.configs.keys());
    const allTypes = [...new Set([...hardcodedTypes, ...dynamicTypes])];
    console.log(`[DataSourceManager] 📋 Registered types: hardcoded=${hardcodedTypes.length}, dynamic=${dynamicTypes.length}, total=${allTypes.length}`);
    return allTypes;
  }
  
  isValidType(type: string): boolean {
    const isHardcoded = this.sources.has(type);
    const isDynamic = this.configs.has(type);
    console.log(`[DataSourceManager] 🔍 Type validation: ${type} - hardcoded=${isHardcoded}, dynamic=${isDynamic}`);
    return isHardcoded || isDynamic;
  }
}

export const dataSourceManager = new DataSourceManager();
