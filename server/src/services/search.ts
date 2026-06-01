import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { SearchResult } from '../types.js';
import { isDomainAllowed } from '../utils/urlValidator.js';

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

// 频率限制器
class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 5000) {
    this.minInterval = minIntervalMs;
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

const bingLimiter = new RateLimiter(5000);
const googleLimiter = new RateLimiter(10000);
const duckduckgoLimiter = new RateLimiter(3000);
const hackernewsLimiter = new RateLimiter(1000); // HN API 更宽松

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function searchBing(query: string): Promise<SearchResult[]> {
  await bingLimiter.wait();

  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: {
        q: query,
        count: 20
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('li.b_algo').each((_, element) => {
      const titleElement = $(element).find('h2 a');
      const title = titleElement.text().trim();
      const url = titleElement.attr('href');
      const snippet = $(element).find('.b_caption p').text().trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: snippet,
          url,
          source: 'bing',
          publishedAt: new Date()
        });
      }
    });

    console.log(`Bing search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Bing search error:', error);
    return [];
  }
}

export async function searchGoogle(query: string): Promise<SearchResult[]> {
  await googleLimiter.wait();

  try {
    const response = await axios.get('https://www.google.com/search', {
      params: {
        q: query,
        num: 20,
        hl: 'en'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('div.g').each((_, element) => {
      const titleElement = $(element).find('h3').first();
      const title = titleElement.text().trim();
      const linkElement = $(element).find('a').first();
      const url = linkElement.attr('href');
      const snippet = $(element).find('.VwiC3b').text().trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: snippet,
          url,
          source: 'google',
          publishedAt: new Date()
        });
      }
    });

    console.log(`Google search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Google search error:', error);
    return [];
  }
}

// DuckDuckGo 搜索（使用 HTML 版本）
export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  await duckduckgoLimiter.wait();

  try {
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: {
        q: query
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('.result').each((_, element) => {
      const titleElement = $(element).find('.result__title a');
      const title = titleElement.text().trim();
      const rawUrl = titleElement.attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();

      // DuckDuckGo 使用重定向 URL，需要提取实际 URL
      let url = rawUrl;
      if (rawUrl && rawUrl.includes('uddg=')) {
        try {
          const urlParams = new URLSearchParams(rawUrl.split('?')[1]);
          url = decodeURIComponent(urlParams.get('uddg') || rawUrl);
        } catch {
          url = rawUrl;
        }
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: snippet,
          url,
          source: 'duckduckgo',
          publishedAt: new Date()
        });
      }
    });

    console.log(`DuckDuckGo search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    return [];
  }
}

// Hacker News API（官方免费 API）
interface HNSearchResult {
  hits: Array<{
    objectID: string;
    title: string;
    url: string | null;
    story_text: string | null;
    author: string;
    points: number;
    num_comments: number;
    created_at: string;
  }>;
}

export async function searchHackerNews(query: string): Promise<SearchResult[]> {
  await hackernewsLimiter.wait();

  try {
    // 使用 Algolia 提供的 HN 搜索 API
    const oneDayAgo = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);
    const response = await axios.get<HNSearchResult>('https://hn.algolia.com/api/v1/search', {
      params: {
        query: query,
        tags: 'story', // 只搜索故事，排除评论
        hitsPerPage: 20,
        numericFilters: `created_at_i>${oneDayAgo}` // 只搜最近24小时
      },
      timeout: 15000
    });

    const results: SearchResult[] = response.data.hits
      .filter(hit => hit.url || hit.story_text) // 确保有内容
      .map(hit => ({
        title: hit.title,
        content: hit.story_text || hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: 'hackernews' as const,
        sourceId: hit.objectID,
        publishedAt: new Date(hit.created_at),
        score: hit.points,
        commentCount: hit.num_comments,
        author: {
          name: hit.author,
          username: hit.author
        }
      }));

    console.log(`Hacker News search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Hacker News search error:', error);
    return [];
  }
}

const TRACKING_PARAMS = [
  'src', 'timestamp', 'ver', 'signature', 'new', 'from', 'share', 'shareid', 
  'wxshare', 'wechatshare', '_t', 'timestamp_ms', 'isappinstalled',
  '__biz', 'mid', 'idx', 'sn', 'chksm', 'scene', 'subscene', 
  'clicktime', 'ascene', 'devicetype', 'version', 'nettype', 
  'abtest_cookie', 'lang', 'exportkey', 'pass_ticket', 'uin', 
  'key', 'f', 'spm', 'k', 't', 'ref', 'id', 'source', 
  'sxtoken', 'access_token', 'openid', 'unionid', 'appid'
];

const EXCLUDED_PATH_PATTERNS = [
  /^\/topic\//,
  /^\/group\//,
  /^\/column\//,
  /^\/category\//,
  /^\/list\//,
  /^\/tag\//,
  /^\/channel\//,
  /^\/section\//,
];

const AGGREGATION_HOSTNAMES = [
  'toutiao.com',
  'weibo.com',
  'zhihu.com',
  'bilibili.com',
];

export function isTopicOrAggregationUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    
    if (AGGREGATION_HOSTNAMES.some(h => hostname.includes(h))) {
      return EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(pathname));
    }
    
    return false;
  } catch {
    return false;
  }
}

export function normalizeUrlForDeduplication(url: string): string {
  try {
    const parsedUrl = new URL(url);
    
    TRACKING_PARAMS.forEach(param => {
      parsedUrl.searchParams.delete(param);
    });
    
    const searchString = parsedUrl.search.toString();
    const hasQuery = searchString.length > 1;
    
    let normalized = `https://${parsedUrl.hostname}${parsedUrl.pathname}`;
    if (hasQuery) {
      normalized += searchString;
    }
    
    return normalized.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
  }
}

const MAX_AGE_DAYS = 7;

export function deduplicateResults(allResults: SearchResult[]): SearchResult[] {
  const uniqueUrls = new Set<string>();
  const uniqueTitles = new Set<string>();
  const cutoffTime = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  
  return allResults.filter(item => {
    if (!isDomainAllowed(item.url)) {
      return false;
    }
    
    if (isTopicOrAggregationUrl(item.url)) {
      return false;
    }
    
    if (item.publishedAt) {
      const publishTime = typeof item.publishedAt === 'string' 
        ? new Date(item.publishedAt).getTime() 
        : item.publishedAt.getTime();
      if (publishTime < cutoffTime) {
        return false;
      }
    }
    
    const normalizedUrl = normalizeUrlForDeduplication(item.url);
    const normalizedTitle = item.title.toLowerCase().trim();
    
    if (uniqueUrls.has(normalizedUrl)) {
      return false;
    }
    
    if (uniqueTitles.has(normalizedTitle)) {
      return false;
    }
    
    uniqueUrls.add(normalizedUrl);
    uniqueTitles.add(normalizedTitle);
    return true;
  });
}

// 聚合搜索（国际搜索引擎，仅保留可用的）
export async function searchAll(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchBing(query),
    searchHackerNews(query)
  ]);

  const allResults: SearchResult[] = [];
  const sourceNames = ['Bing', 'HackerNews'];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      console.warn(`${sourceNames[index]} search failed:`, result.reason);
    }
  });

  const uniqueResults = deduplicateResults(allResults);
  console.log(`Search aggregation for "${query}": ${allResults.length} total, ${uniqueResults.length} unique`);
  return uniqueResults;
}

export function generateContentFingerprint(title: string, content: string): string {
  const text = `${title}\n${content}`.toLowerCase().trim();
  const normalizedText = text
    .replace(/\s+/g, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  return crypto.createHash('md5').update(normalizedText).digest('hex');
}
