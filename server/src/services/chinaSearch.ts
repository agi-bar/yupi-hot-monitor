/**
 * 国内搜索引擎服务
 * 优化: 复用 RateLimiter/safeGet 工具，统一错误处理
 */
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import axios from 'axios';
import type { SearchResult } from '../types.js';
import { safeGet, limiters, getRandomUserAgent } from '../utils/rateLimiter.js';

// ============================================================
// 搜狗搜索
// ============================================================
export async function searchSogou(query: string): Promise<SearchResult[]> {
  const response = await safeGet<any>('https://www.sogou.com/web', { query, ie: 'utf-8' }, {
    limiter: limiters.sogou
  });
  if (!response) return [];

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('.vrwrap, .rb').each((_, element) => {
    const titleElement = $(element).find('h3 a, .vr-title a, .vrTitle a').first();
    const title = titleElement.text().trim();
    let url = titleElement.attr('href') || '';
    if (url.startsWith('/link?url=')) {
      url = `https://www.sogou.com${url}`;
    }
    const snippet = $(element).find('.space-txt, .str-text-info, .str_info, .text-layout').text().trim()
      || $(element).find('p').first().text().trim();

    if (title && url && !title.includes('大家还在搜')) {
      results.push({ title, content: snippet || title, url, source: 'sogou' });
    }
  });

  console.log(`Sogou search for "${query}": found ${results.length} results`);
  return results;
}

// ============================================================
// Bilibili 搜索（公开 API）
// ============================================================
interface BilibiliSearchResponse {
  code: number;
  data?: { result?: BilibiliVideoResult[] };
}

interface BilibiliVideoResult {
  aid: number;
  bvid: string;
  title: string;
  description: string;
  author: string;
  mid: number;
  pic: string;
  play: number;
  favorites: number;
  review: number;
  danmaku: number;
  like: number;
  pubdate: number;
  tag: string;
}

interface BilibiliUserSearchResponse {
  code: number;
  data?: { result?: BilibiliUserResult[] };
}

interface BilibiliUserResult {
  mid: number;
  uname: string;
  usign: string;
  fans: number;
  videos: number;
  upic: string;
  official_verify: { type: number; desc: string };
}

interface BilibiliSpaceResponse {
  code: number;
  data?: { list?: { vlist?: BilibiliSpaceVideo[] } };
}

interface BilibiliSpaceVideo {
  aid: number;
  bvid: string;
  title: string;
  description: string;
  author: string;
  mid: number;
  pic: string;
  play: number;
  favorites: number;
  review: number;
  comment: number;
  danmaku: number;
  created: number;
}

/**
 * B站接口需要更精细的 Header 控制（Referer + buvid3 cookie），
 * 因此这里不直接用 safeGet，而是封装专用 fetcher。
 */
async function bilibiliFetch<T>(url: string, params: Record<string, any>, extraCookies: Record<string, string> = {}): Promise<T | null> {
  await limiters.bilibili.wait();
  try {
    const response = await axios.get<T>(url, {
      params,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': 'https://search.bilibili.com/',
        'Accept': 'application/json',
        ...(Object.keys(extraCookies).length && {
          'Cookie': Object.entries(extraCookies).map(([k, v]) => `${k}=${v}`).join('; ')
        })
      },
      timeout: 15000
    });
    return response.data;
  } catch (error) {
    console.error('Bilibili fetch error:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function searchBilibili(query: string): Promise<SearchResult[]> {
  const buvid3 = `${crypto.randomUUID()}infoc`;
  const data = await bilibiliFetch<BilibiliSearchResponse>(
    'https://api.bilibili.com/x/web-interface/search/type',
    { keyword: query, search_type: 'video', order: 'pubdate', page: 1, pagesize: 20 },
    { buvid3 }
  );
  if (!data || data.code !== 0 || !data.data?.result) return [];

  return data.data.result.map(video => ({
    title: video.title.replace(/<\/?em[^>]*>/g, ''),
    content: video.description || video.title.replace(/<\/?em[^>]*>/g, ''),
    url: `https://www.bilibili.com/video/${video.bvid}`,
    source: 'bilibili' as const,
    sourceId: video.bvid,
    publishedAt: new Date(video.pubdate * 1000),
    viewCount: video.play,
    likeCount: video.like,
    commentCount: video.review,
    danmakuCount: video.danmaku,
    author: { name: video.author, username: String(video.mid) }
  }));
}

export async function searchBilibiliUser(keyword: string): Promise<BilibiliUserResult | null> {
  const data = await bilibiliFetch<BilibiliUserSearchResponse>(
    'https://api.bilibili.com/x/web-interface/search/type',
    { keyword, search_type: 'bili_user', page: 1, pagesize: 5 }
  );
  if (!data || data.code !== 0 || !data.data?.result?.length) return null;

  const exactMatch = data.data.result.find(
    user => user.uname === keyword || user.uname.toLowerCase() === keyword.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  const topResult = data.data.result[0];
  if (topResult.fans > 1000 && topResult.uname.includes(keyword)) return topResult;

  return null;
}

export async function getBilibiliUserVideos(mid: number): Promise<SearchResult[]> {
  const data = await bilibiliFetch<BilibiliSpaceResponse>(
    'https://api.bilibili.com/x/space/arc/search',
    { mid, pn: 1, ps: 10, order: 'pubdate' }
  );
  if (!data || data.code !== 0 || !data.data?.list?.vlist) return [];

  return data.data.list.vlist.map(video => ({
    title: video.title,
    content: video.description || video.title,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    source: 'bilibili' as const,
    sourceId: video.bvid,
    publishedAt: new Date(video.created * 1000),
    viewCount: video.play,
    commentCount: video.comment || video.review,
    danmakuCount: video.danmaku,
    author: { name: video.author, username: String(video.mid) }
  }));
}

// ============================================================
// 微博热搜
// ============================================================
interface WeiboHotItem {
  word: string;
  note?: string;
  num: number;
  category?: string;
  mid?: string;
  raw_hot?: number;
}

export async function searchWeibo(query: string): Promise<SearchResult[]> {
  await limiters.weibo.wait();
  let data: any;
  try {
    const response = await axios.get('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://weibo.com/'
      },
      timeout: 15000
    });
    data = response.data;
  } catch (error) {
    console.error('Weibo hot search error:', error instanceof Error ? error.message : error);
    return [];
  }

  if (data?.ok !== 1 || !data?.data?.realtime) return [];

  const hotItems: WeiboHotItem[] = data.data.realtime;
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);

  for (const item of hotItems) {
    const word = (item.note || item.word || '').toLowerCase();
    const isMatch = queryWords.some(qw => word.includes(qw) || qw.includes(word))
      || word.includes(queryLower)
      || queryLower.includes(word);

    if (isMatch) {
      const topicName = item.note || item.word;
      const url = `https://s.weibo.com/weibo?q=${encodeURIComponent('#' + topicName + '#')}`;
      results.push({
        title: `🔥 微博热搜: ${topicName}`,
        content: `微博热搜话题「${topicName}」，热度 ${item.num?.toLocaleString() || '未知'}`,
        url,
        source: 'weibo' as const,
        viewCount: item.num || 0
      });
    }
  }

  if (results.length > 0) {
    console.log(`Weibo hot search: ${results.length} matches for "${query}"`);
  }
  return results;
}

// ============================================================
// 账号检测
// ============================================================
export interface AccountInfo {
  platform: 'bilibili' | 'weibo';
  name: string;
  id: string;
  followers: number;
  verified: boolean;
  description: string;
  avatar?: string;
}

export async function detectAndFetchAccount(keyword: string): Promise<{
  accounts: AccountInfo[];
  results: SearchResult[];
}> {
  const accounts: AccountInfo[] = [];
  const results: SearchResult[] = [];

  try {
    const biliUser = await searchBilibiliUser(keyword);
    if (biliUser) {
      accounts.push({
        platform: 'bilibili',
        name: biliUser.uname,
        id: String(biliUser.mid),
        followers: biliUser.fans,
        verified: biliUser.official_verify?.type >= 0,
        description: biliUser.usign,
        avatar: biliUser.upic
      });
      console.log(`🎯 Detected Bilibili account: ${biliUser.uname} (${biliUser.fans} fans)`);
      const userVideos = await getBilibiliUserVideos(biliUser.mid);
      results.push(...userVideos);
    }
  } catch (error) {
    console.error('Bilibili account detection error:', error instanceof Error ? error.message : error);
  }

  return { accounts, results };
}

// ============================================================
// 国内聚合搜索
// ============================================================
export async function searchAllChina(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchSogou(query),
    searchBilibili(query),
    searchWeibo(query)
  ]);

  const allResults: SearchResult[] = [];
  const sourceNames = ['Sogou', 'Bilibili', 'Weibo'];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
      console.log(`  ${sourceNames[index]}: ${result.value.length} results`);
    } else {
      console.warn(`  ${sourceNames[index]} search failed:`, result.reason);
    }
  });

  return allResults;
}
