import * as cheerio from 'cheerio';
import axios from 'axios';
import type { SearchOptions, SearchResult } from '../types/datasource.js';
import { BaseDataSource } from './BaseDataSource.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

export class BaiduDataSource extends BaseDataSource {
  readonly id = 'baidu';
  readonly name = '百度搜索';
  readonly icon = '🔍';
  
  private requestCount = 0;
  private lastResetTime = Date.now();
  private readonly MIN_INTERVAL = 3000;
  
  constructor() {
    super();
  }
  
  protected async ping(): Promise<boolean> {
    try {
      await axios.head('https://www.baidu.com', {
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
    
    const params = new URLSearchParams({
      word: options.query,
      tn: 'news',
      rn: String(options.pageSize || 20),
      pn: String(((options.page || 1) - 1) * (options.pageSize || 20))
    });
    
    try {
      const response = await this.httpClient.get(
        `https://www.baidu.com/s?${params.toString()}`,
        {
          headers: {
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br'
          },
          timeout: 15000
        }
      );
      
      return this.parseResults(response.data);
    } catch (error) {
      console.error('Baidu search error:', error);
      return [];
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
    
    $('div.result, .c-container').each((_, element) => {
      const titleElement = $(element).find('h3 a, .t a').first();
      const title = titleElement.text().trim();
      const url = titleElement.attr('href') || '';
      
      const abstractElement = $(element).find('.c-abstract, .content-right_8Zs40').first();
      const abstract = abstractElement.text().trim();
      
      const timeElement = $(element).find('.c-color-gray2, .c-color-gray').first();
      const timeText = timeElement.text().trim();
      
      const siteElement = $(element).find('.c-color-gray, .c-site_info').first();
      const siteName = siteElement.text().trim();
      
      if (title && url && url.startsWith('http')) {
        let publishedAt: Date | undefined;
        if (timeText) {
          publishedAt = this.parseTime(timeText);
        }
        
        results.push({
          title,
          content: abstract || title,
          url,
          source: this.id,
          publishedAt,
          author: siteName ? { name: siteName } : undefined
        });
      }
    });
    
    console.log(`Baidu search: found ${results.length} results`);
    return results;
  }
  
  private parseTime(timeText: string): Date | undefined {
    const now = new Date();
    
    if (timeText.includes('分钟前')) {
      const minutes = parseInt(timeText.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - minutes * 60 * 1000);
    }
    
    if (timeText.includes('小时前')) {
      const hours = parseInt(timeText.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    
    if (timeText.includes('昨天')) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    
    const dateMatch = timeText.match(/(\d+)-(\d+)-(\d+)/);
    if (dateMatch) {
      return new Date(
        parseInt(dateMatch[1]),
        parseInt(dateMatch[2]) - 1,
        parseInt(dateMatch[3])
      );
    }
    
    return undefined;
  }
}
