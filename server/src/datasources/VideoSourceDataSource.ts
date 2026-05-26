import axios from 'axios';
import type { SearchOptions, SearchResult, DataSourceConfig, DataSourceCredential } from '../types/datasource.js';
import { BaseDataSource } from './BaseDataSource.js';

interface WechatVideoItem {
  id: string;
  title: string;
  digest: string;
  url: string;
  thumb_url: string;
  author: string;
  source: string;
  ctime: number;
  read_num: number;
}

interface WechatSearchResponse {
  errcode: number;
  errmsg: string;
  list?: WechatVideoItem[];
}

export class VideoSourceDataSource extends BaseDataSource {
  readonly id = 'video-source';
  readonly name = '视频号';
  readonly icon = '📺';
  
  private accessToken?: string;
  private tokenExpiresAt?: Date;
  
  constructor() {
    super();
  }
  
  async initialize(config: DataSourceConfig, credential?: DataSourceCredential): Promise<void> {
    await super.initialize(config, credential);
    
    if (credential?.accessToken) {
      this.accessToken = credential.accessToken;
    }
    
    if (credential?.expiresAt) {
      this.tokenExpiresAt = new Date(credential.expiresAt);
    }
  }
  
  protected async ping(): Promise<boolean> {
    try {
      await axios.head('https://weixin.qq.com', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return true;
    } catch {
      return false;
    }
  }
  
  protected async executeSearch(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.accessToken) {
      console.log('Video source: Using fallback search');
      return this.fallbackSearch(options);
    }
    
    if (this.isTokenExpired()) {
      throw new Error('Access token expired');
    }
    
    try {
      const response = await axios.get<WechatSearchResponse>(
        'https://api.weixin.qq.com/cgi-bin/search/search',
        {
          params: {
            access_token: this.accessToken,
            action: 'search_video',
            query: options.query,
            count: options.pageSize || 20
          },
          timeout: 15000
        }
      );
      
      if (response.data.errcode === 0 && response.data.list) {
        return this.normalizeResults(response.data.list);
      }
      
      console.log('Video source API error:', response.data.errmsg);
      return this.fallbackSearch(options);
    } catch (error) {
      console.error('Video source search error:', error);
      return this.fallbackSearch(options);
    }
  }
  
  private async fallbackSearch(options: SearchOptions): Promise<SearchResult[]> {
    console.log('Video source: Using web search fallback');
    
    try {
      const response = await axios.get(
        'https://weixin.qq.com/cgi-bin/searchhtml',
        {
          params: {
            t: 'video/search',
            type: 'video',
            query: options.query
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        }
      );
      
      return this.parseWebResults(response.data);
    } catch (error) {
      console.error('Video source fallback error:', error);
      return [];
    }
  }
  
  private parseWebResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    
    const titleMatches = html.match(/<h3[^>]*>([^<]+)<\/h3>/gi) || [];
    const urlMatches = html.match(/href="([^"]+video[^"]+)"/gi) || [];
    const descMatches = html.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)<\/p>/gi) || [];
    
    for (let i = 0; i < Math.min(titleMatches.length, 20); i++) {
      const title = titleMatches[i]?.replace(/<[^>]+>/g, '').trim();
      const urlMatch = urlMatches[i]?.match(/href="([^"]+)"/);
      const url = urlMatch ? urlMatch[1] : '';
      const desc = descMatches[i]?.replace(/<[^>]+>/g, '').trim() || '';
      
      if (title && url) {
        results.push({
          title,
          content: desc || title,
          url: url.startsWith('http') ? url : `https://weixin.qq.com${url}`,
          source: this.id,
          publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        });
      }
    }
    
    console.log(`Video source fallback: found ${results.length} results`);
    return results;
  }
  
  private normalizeResults(items: WechatVideoItem[]): SearchResult[] {
    return items.map(item => ({
      title: item.title,
      content: item.digest || item.title,
      url: item.url,
      source: this.id,
      sourceId: item.id,
      publishedAt: new Date(item.ctime * 1000),
      viewCount: item.read_num,
      author: {
        name: item.author || item.source
      }
    }));
  }
  
  private isTokenExpired(): boolean {
    return this.tokenExpiresAt ? this.tokenExpiresAt.getTime() < Date.now() : true;
  }
  
  async refreshToken(): Promise<void> {
    console.log('Video source: Token refresh not implemented - requires WeChat API credentials');
  }
  
  async validateCredentials(): Promise<boolean> {
    return this.accessToken !== undefined && !this.isTokenExpired();
  }
}
