/**
 * 国际搜索引擎服务
 * 优化: 使用共享的 RateLimiter/safeGet 工具，去除重复代码
 */
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { safeGet, limiters } from '../utils/rateLimiter.js';

// ============================================================
// Bing 搜索
// ============================================================
export async function searchBing(query: string): Promise<SearchResult[]> {
  const response = await safeGet<any>('https://www.bing.com/search', { q: query, count: 20 }, {
    limiter: limiters.bing
  });
  if (!response) return [];

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('li.b_algo').each((_, element) => {
    const titleElement = $(element).find('h2 a');
    const title = titleElement.text().trim();
    const url = titleElement.attr('href');
    const snippet = $(element).find('.b_caption p').text().trim();

    if (title && url && url.startsWith('http')) {
      results.push({ title, content: snippet, url, source: 'bing' });
    }
  });

  console.log(`Bing search for "${query}": found ${results.length} results`);
  return results;
}

// ============================================================
// Google 搜索
// ============================================================
export async function searchGoogle(query: string): Promise<SearchResult[]> {
  const response = await safeGet<any>('https://www.google.com/search', { q: query, num: 20, hl: 'en' }, {
    limiter: limiters.google
  });
  if (!response) return [];

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('div.g').each((_, element) => {
    const titleElement = $(element).find('h3').first();
    const title = titleElement.text().trim();
    const linkElement = $(element).find('a').first();
    const url = linkElement.attr('href');
    const snippet = $(element).find('.VwiC3b').text().trim();

    if (title && url && url.startsWith('http')) {
      results.push({ title, content: snippet, url, source: 'google' });
    }
  });

  console.log(`Google search for "${query}": found ${results.length} results`);
  return results;
}

// ============================================================
// DuckDuckGo 搜索（HTML 版本，最稳）
// ============================================================
export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const response = await safeGet<any>('https://html.duckduckgo.com/html/', { q: query }, {
    limiter: limiters.duckduckgo
  });
  if (!response) return [];

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('.result').each((_, element) => {
    const titleElement = $(element).find('.result__title a');
    const title = titleElement.text().trim();
    const rawUrl = titleElement.attr('href');
    const snippet = $(element).find('.result__snippet').text().trim();

    // DDG 使用重定向 URL，需要提取实际 URL
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
      results.push({ title, content: snippet, url, source: 'duckduckgo' });
    }
  });

  console.log(`DuckDuckGo search for "${query}": found ${results.length} results`);
  return results;
}

// ============================================================
// Hacker News API（官方免费）
// ============================================================
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
  const oneDayAgo = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);
  const response = await safeGet<HNSearchResult>('https://hn.algolia.com/api/v1/search', {
    query,
    tags: 'story',
    hitsPerPage: 20,
    numericFilters: `created_at_i>${oneDayAgo}`
  }, { limiter: limiters.hackernews });

  if (!response) return [];

  const results: SearchResult[] = response.data.hits
    .filter(hit => hit.url || hit.story_text)
    .map(hit => ({
      title: hit.title,
      content: hit.story_text || hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: 'hackernews' as const,
      sourceId: hit.objectID,
      publishedAt: new Date(hit.created_at),
      // HN score (upvotes) 映射为 likeCount，让热度公式生效
      likeCount: hit.points,
      // HN num_comments 映射为 commentCount
      commentCount: hit.num_comments,
      score: hit.points,
      author: { name: hit.author, username: hit.author }
    }));

  console.log(`Hacker News search for "${query}": found ${results.length} results`);
  return results;
}

// ============================================================
// 去重
// ============================================================
export function deduplicateResults(allResults: SearchResult[]): SearchResult[] {
  const uniqueUrls = new Set<string>();
  return allResults.filter(item => {
    const normalizedUrl = item.url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
    if (uniqueUrls.has(normalizedUrl)) return false;
    uniqueUrls.add(normalizedUrl);
    return true;
  });
}

// ============================================================
// 聚合搜索
// ============================================================
export async function searchAll(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchBing(query),
    searchDuckDuckGo(query),
    searchHackerNews(query)
  ]);

  const allResults: SearchResult[] = [];
  const sourceNames = ['Bing', 'DuckDuckGo', 'HackerNews'];

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
