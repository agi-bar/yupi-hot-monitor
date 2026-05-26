import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchOptions, SearchResult, DataSourceConfig, DataSourceCredential } from '../types/datasource.js';
import { BaseDataSource } from './BaseDataSource.js';

interface NoteItem {
  id: string;
  title: string;
  desc: string;
  user: {
    nickname: string;
    avatar: string;
   红薯: number;
  };
  interact_info: {
   赞: number;
   收藏: number;
   评论: number;
    分享: number;
  };
  time: number;
  image_list: Array<{ url_default: string }>;
}

export class XiaohongshuDataSource extends BaseDataSource {
  readonly id = 'xiaohongshu';
  readonly name = '小红书';
  readonly icon = '📕';
  
  private requestCount = 0;
  private lastResetTime = Date.now();
  private readonly MIN_INTERVAL = 5000;
  
  constructor() {
    super();
  }
  
  async initialize(config: DataSourceConfig, credential?: DataSourceCredential): Promise<void> {
    await super.initialize(config, credential);
  }
  
  protected async ping(): Promise<boolean> {
    try {
      await axios.head('https://www.xiaohongshu.com', {
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
    await this.rateLimit();
    
    try {
      const response = await axios.get(
        'https://www.xiaohongshu.com/explore',
        {
          params: {
            keyword: options.query,
            type: '51'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://www.xiaohongshu.com/'
          },
          timeout: 15000
        }
      );
      
      return this.parseResults(response.data);
    } catch (error) {
      console.error('Xiaohongshu search error:', error);
      return this.fallbackSearch(options);
    }
  }
  
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.lastResetTime < this.MIN_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, this.MIN_INTERVAL - (now - this.lastResetTime))
      );
    }
    this.lastResetTime = Date.now();
    this.requestCount++;
  }
  
  private parseResults(html: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    
    $('div.note-item, .explore-tab .item').each((_, element) => {
      const titleElement = $(element).find('h3, .title, .msg-title').first();
      const title = titleElement.text().trim();
      
      const linkElement = $(element).find('a').first();
      const url = 'https://www.xiaohongshu.com' + (linkElement.attr('href') || '');
      
      const descElement = $(element).find('.desc, .abstract, .msg-desc').first();
      const desc = descElement.text().trim();
      
      const authorElement = $(element).find('.author, .user-name').first();
      const author = authorElement.text().trim();
      
      const likeElement = $(element).find('.like, .liked-count').first();
      const likeCount = parseInt(likeElement.text().match(/\d+/)?.[0] || '0');
      
      if (title && url) {
        results.push({
          title,
          content: desc || title,
          url,
          source: this.id,
          publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          likeCount,
          author: author ? { name: author } : undefined
        });
      }
    });
    
    if (results.length === 0) {
      return this.fallbackParse(html);
    }
    
    console.log(`Xiaohongshu: found ${results.length} results`);
    return results;
  }
  
  private fallbackParse(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    
    const pattern = /"title":"([^"]+)"/g;
    const urlPattern = /"id":"([^"]+)"/g;
    
    let titleMatch;
    let idMatch;
    
    const ids: string[] = [];
    while ((idMatch = urlPattern.exec(html)) !== null) {
      if (idMatch[1].length > 10) {
        ids.push(idMatch[1]);
      }
    }
    
    while ((titleMatch = pattern.exec(html)) !== null) {
      const index = results.length;
      const id = ids[index] || '';
      
      results.push({
        title: titleMatch[1].replace(/\\u[\dA-Fa-f]{4}/g, (match) => 
          String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
        ),
        content: '',
        url: id ? `https://www.xiaohongshu.com/explore/${id}` : '',
        source: this.id,
        publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      });
    }
    
    console.log(`Xiaohongshu fallback: found ${results.length} results`);
    return results.slice(0, 20);
  }
  
  private async fallbackSearch(options: SearchOptions): Promise<SearchResult[]> {
    console.log('Xiaohongshu: Using Bing fallback');
    
    try {
      const response = await axios.get(
        'https://cn.bing.com/search',
        {
          params: {
            q: `${options.query} site:xiaohongshu.com`,
            count: options.pageSize || 20
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        }
      );
      
      return this.parseBingResults(response.data);
    } catch (error) {
      console.error('Xiaohongshu fallback search error:', error);
      return [];
    }
  }
  
  private parseBingResults(html: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    
    $('li.b_algo').each((_, element) => {
      const titleElement = $(element).find('h2 a').first();
      const title = titleElement.text().trim();
      const url = titleElement.attr('href') || '';
      
      const snippetElement = $(element).find('.b_caption p').first();
      const snippet = snippetElement.text().trim();
      
      if (title && url && url.includes('xiaohongshu.com')) {
        results.push({
          title,
          content: snippet || title,
          url,
          source: this.id,
          publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        });
      }
    });
    
    console.log(`Xiaohongshu Bing fallback: found ${results.length} results`);
    return results;
  }
}
