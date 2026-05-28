import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { extractRealUrlFromBing, resolveRedirectUrl, extractRealUrlFromBaidu } from '../utils/urlResolver.js';
import { parseSearchEngineDate } from '../utils/dateParser.js';

// 清理文本内容中的多余空行和格式字符
function cleanTextContent(text: string): string {
  return text
    // 替换多个连续空行为单个换行
    .replace(/\n{3,}/g, '\n\n')
    // 替换多个空格为单个空格
    .replace(/\s{2,}/g, ' ')
    // 清理行首行尾空格
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}

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
      const rawUrl = titleElement.attr('href');
      const snippet = $(element).find('.b_caption p').text().trim();

      // 提取时间信息
      let publishedAt: Date | undefined;
      
      // 首先尝试从专门的时间元素中提取
      const dateElement = $(element).find('.news_dt, .b_att, [attrib="date"]').first();
      if (dateElement.length > 0) {
        const dateStr = dateElement.text().trim();
        publishedAt = parseSearchEngineDate(dateStr) || undefined;
      }
      
      // 如果没有找到，尝试从 snippet 中提取时间
      if (!publishedAt && snippet) {
        // 格式1: "Aug 10, 2025 · xxx"
        const timeMatch = snippet.match(/^([A-Za-z]+\s+\d{1,2},?\s*\d{0,4})\s*[·|·]\s*/);
        if (timeMatch) {
          publishedAt = parseSearchEngineDate(timeMatch[1]) || undefined;
        }
        
        // 格式2: "1 day ago · xxx" 或 "2 hours ago · xxx"
        if (!publishedAt) {
          const relativeTimeMatch = snippet.match(/^(\d+\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\s*[·|·]\s*/i);
          if (relativeTimeMatch) {
            publishedAt = parseSearchEngineDate(relativeTimeMatch[1]) || undefined;
          }
        }
        
        // 格式3: "yesterday · xxx"
        if (!publishedAt) {
          const yesterdayMatch = snippet.match(/^(yesterday)\s*[·|·]\s*/i);
          if (yesterdayMatch) {
            publishedAt = parseSearchEngineDate(yesterdayMatch[1]) || undefined;
          }
        }
      }

      // 清理 snippet 中的时间前缀
      let cleanContent = snippet;
      if (snippet) {
        // 移除各种时间前缀
        const timePatterns = [
          /^([A-Za-z]+\s+\d{1,2},?\s*\d{0,4})\s*[·|·]\s*/,
          /^(\d+\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\s*[·|·]\s*/i,
          /^(yesterday)\s*[·|·]\s*/i
        ];
        
        for (const pattern of timePatterns) {
          const match = snippet.match(pattern);
          if (match) {
            cleanContent = snippet.substring(match[0].length).trim();
            break;
          }
        }
      }

      if (title && rawUrl && rawUrl.startsWith('http')) {
        results.push({
          title,
          content: cleanTextContent(cleanContent),
          url: rawUrl,
          source: 'bing',
          rawUrl,
          publishedAt
        });
      }
    });

    console.log(`Bing search for "${query}": found ${results.length} results`);
    
    const resolvedResults = await resolveSearchEngineUrls(results);
    return resolvedResults;
  } catch (error) {
    console.error('Bing search error:', error);
    return [];
  }
}

async function resolveSearchEngineUrls(results: SearchResult[]): Promise<SearchResult[]> {
  const resolvedResults: SearchResult[] = [];

  for (const result of results) {
    if (result.rawUrl) {
      if (result.rawUrl.includes('bing.com/') && (result.rawUrl.includes('/cr?') || result.rawUrl.includes('/redirect'))) {
        const extractedUrl = extractRealUrlFromBing(result.rawUrl);
        if (extractedUrl) {
          resolvedResults.push({ ...result, url: extractedUrl });
          continue;
        }
        
        const resolveResult = await resolveRedirectUrl(result.rawUrl);
        if (resolveResult.success) {
          resolvedResults.push({ ...result, url: resolveResult.realUrl });
        } else {
          resolvedResults.push(result);
        }
        continue;
      }

      if (result.rawUrl.includes('baidu.com/link')) {
        const extractedUrl = extractRealUrlFromBaidu(result.rawUrl);
        if (extractedUrl) {
          resolvedResults.push({ ...result, url: extractedUrl });
          continue;
        }
        
        const resolveResult = await resolveRedirectUrl(result.rawUrl);
        if (resolveResult.success) {
          resolvedResults.push({ ...result, url: resolveResult.realUrl });
        } else {
          resolvedResults.push(result);
        }
        continue;
      }
    }

    resolvedResults.push(result);
  }

  return resolvedResults;
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

      // 提取时间信息
      let publishedAt: Date | undefined;
      const dateElement = $(element).find('.MUxGbd, .出的时间, [data-date]').first();
      if (dateElement.length > 0) {
        const dateStr = dateElement.text().trim();
        publishedAt = parseSearchEngineDate(dateStr) || undefined;
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: cleanTextContent(snippet),
          url,
          source: 'google',
          publishedAt
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

      // 提取时间信息
      let publishedAt: Date | undefined;
      const dateElement = $(element).find('.result__timestamp').first();
      if (dateElement.length > 0) {
        const dateStr = dateElement.text().trim();
        publishedAt = parseSearchEngineDate(dateStr) || undefined;
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          content: cleanTextContent(snippet),
          url,
          source: 'duckduckgo',
          publishedAt
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

// 去重工具函数
export function deduplicateResults(allResults: SearchResult[]): SearchResult[] {
  const uniqueUrls = new Set<string>();
  return allResults.filter(item => {
    // 标准化 URL 用于去重
    const normalizedUrl = item.url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
    if (uniqueUrls.has(normalizedUrl)) {
      return false;
    }
    uniqueUrls.add(normalizedUrl);
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
