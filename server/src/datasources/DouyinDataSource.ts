import axios from 'axios';
import type { SearchOptions, SearchResult, DataSourceConfig, DataSourceCredential } from '../types/datasource.js';
import { BaseDataSource } from './BaseDataSource.js';

interface DouyinVideoItem {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: {
    nickname: string;
    unique_id: string;
    follower_count: number;
    aweme_count: number;
  };
  statistics: {
    play_count: number;
    digg_count: number;
    comment_count: number;
    share_count: number;
    collect_count: number;
  };
  video_labels?: Array<{ label_name: string }>;
}

interface DouyinSearchResponse {
  status_code: number;
  item_list?: DouyinVideoItem[];
  has_more: number;
  cursor: number;
}

export class DouyinDataSource extends BaseDataSource {
  readonly id = 'douyin';
  readonly name = '抖音搜索';
  readonly icon = '🎵';
  
  private apiKey?: string;
  private accessToken?: string;
  private tokenExpiresAt?: Date;
  
  constructor() {
    super();
  }
  
  async initialize(config: DataSourceConfig, credential?: DataSourceCredential): Promise<void> {
    await super.initialize(config, credential);
    
    if (credential?.apiKey) {
      this.apiKey = credential.apiKey;
    }
    
    if (credential?.accessToken) {
      this.accessToken = credential.accessToken;
    }
    
    if (credential?.expiresAt) {
      this.tokenExpiresAt = new Date(credential.expiresAt);
    }
  }
  
  protected async ping(): Promise<boolean> {
    try {
      await axios.head('https://www.douyin.com', {
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
      console.warn('Douyin access token not configured, using fallback');
      return this.fallbackSearch(options);
    }
    
    const keywords = encodeURIComponent(options.query);
    const count = options.pageSize || 20;
    const cursor = ((options.page || 1) - 1) * count;
    
    try {
      const response = await axios.get<DouyinSearchResponse>(
        'https://open.douyin.com/discovery/search',
        {
          params: {
            keyword: keywords,
            count,
            cursor,
            type: 1,
            publish_time: this.getPublishTimeFilter(options.timeRange)
          },
          headers: {
            'Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data.status_code === 0 && response.data.item_list) {
        return this.normalizeResults(response.data.item_list);
      }
      
      return [];
    } catch (error) {
      console.error('Douyin search error:', error);
      return this.fallbackSearch(options);
    }
  }
  
  private async fallbackSearch(options: SearchOptions): Promise<SearchResult[]> {
    console.log('Douyin: Using fallback search method');
    
    try {
      const response = await axios.get(
        'https://www.douyin.com/aweme/v1/web/general/search/single/',
        {
          params: {
            keyword: options.query,
            count: options.pageSize || 20,
            offset: ((options.page || 1) - 1) * (options.pageSize || 20),
            search_channel: 'aweme_video_web',
            enable_history: 1,
            source: 'normal_search'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/'
          },
          timeout: 15000
        }
      );
      
      const data = response.data;
      if (data.status_code === 0 && data.item_list) {
        return this.normalizeResults(data.item_list);
      }
      
      return [];
    } catch (error) {
      console.error('Douyin fallback search error:', error);
      return [];
    }
  }
  
  private normalizeResults(items: DouyinVideoItem[]): SearchResult[] {
    return items.map(item => ({
      title: item.desc || '抖音视频',
      content: item.desc || '',
      url: `https://www.douyin.com/video/${item.aweme_id}`,
      source: this.id,
      sourceId: item.aweme_id,
      publishedAt: new Date(item.create_time * 1000),
      viewCount: item.statistics.play_count,
      likeCount: item.statistics.digg_count,
      commentCount: item.statistics.comment_count,
      shareCount: item.statistics.share_count,
      author: {
        name: item.author.nickname,
        username: item.author.unique_id,
        followers: item.author.follower_count
      }
    }));
  }
  
  private getPublishTimeFilter(timeRange?: string): number {
    const now = Math.floor(Date.now() / 1000);
    
    switch (timeRange) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.floor(today.getTime() / 1000);
      case 'week':
        return now - 7 * 24 * 60 * 60;
      case 'month':
        return now - 30 * 24 * 60 * 60;
      default:
        return now - 7 * 24 * 60 * 60;
    }
  }
  
  async refreshToken(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }
    
    try {
      const response = await axios.post(
        'https://open.douyin.com/oauth/access_token',
        {
          client_key: this.apiKey,
          grant_type: 'client_credential'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data.status_code === 0) {
        this.accessToken = response.data.data.access_token;
        const expiresIn = response.data.data.expires_in;
        this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        
        console.log('Douyin token refreshed, expires at:', this.tokenExpiresAt);
      }
    } catch (error) {
      console.error('Failed to refresh Douyin token:', error);
      throw error;
    }
  }
  
  async validateCredentials(): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }
    
    if (this.tokenExpiresAt && this.tokenExpiresAt.getTime() < Date.now()) {
      try {
        await this.refreshToken();
        return true;
      } catch {
        return false;
      }
    }
    
    return true;
  }
}
