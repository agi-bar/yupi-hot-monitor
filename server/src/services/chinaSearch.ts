import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { SearchResult } from '../types.js';

export const MAX_CONTENT_AGE_DAYS = 180;

// 无发布时间但仍需保留的 URL 模式（如企业介绍、职位信息等长期有效内容）
const LONG_TERM_VALID_PATTERNS = [
  /career\./i,  // 高校就业网站
  /company\/view/i,  // 企业介绍页面
  /\/jobs?\//i,  // 职位页面
  /\/about/i,  // 关于我们页面
  /\/profile/i,  // 企业档案
  /zhilian\.zhaopin/i,  // 智联招聘
  /51job\.com/i,  // 前程无忧
  /liepin\.com/i,  // 猎聘
];

function parseSogouDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }
  return null;
}

function isUrlLongTermValid(url: string): boolean {
  return LONG_TERM_VALID_PATTERNS.some(pattern => pattern.test(url));
}

interface DateCheckResult {
  isTooOld: boolean;
  hasDate: boolean;
  reason: string;
}

function checkContentAge(content: string, url: string, maxAgeDays: number = MAX_CONTENT_AGE_DAYS, explicitDate?: Date): DateCheckResult {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const datePatterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/,
  ];
  
  // 如果有明确的发布日期，直接使用
  if (explicitDate) {
    if (explicitDate.getTime() < cutoff) {
      return {
        isTooOld: true,
        hasDate: true,
        reason: `内容发布日期 ${explicitDate.toLocaleDateString('zh-CN')} 超过 ${maxAgeDays} 天`
      };
    } else {
      return {
        isTooOld: false,
        hasDate: true,
        reason: `内容发布日期 ${explicitDate.toLocaleDateString('zh-CN')} 在有效期内`
      };
    }
  }
  
  // 检查是否为长期有效的 URL
  if (isUrlLongTermValid(url)) {
    return {
      isTooOld: false,
      hasDate: false,
      reason: '长期有效内容（企业介绍/招聘等）'
    };
  }
  
  // 检查微信公众号 URL 中的 timestamp 参数
  const weixinMatch = url.match(/timestamp=(\d{10})/);
  if (weixinMatch) {
    const timestamp = parseInt(weixinMatch[1]) * 1000; // 转换为毫秒
    const publishDate = new Date(timestamp);
    if (publishDate.getTime() < cutoff) {
      return {
        isTooOld: true,
        hasDate: true,
        reason: `微信公众号发布时间 ${publishDate.toLocaleDateString('zh-CN')} 超过 ${maxAgeDays} 天`
      };
    } else {
      return {
        isTooOld: false,
        hasDate: true,
        reason: `微信公众号发布时间 ${publishDate.toLocaleDateString('zh-CN')} 在有效期内`
      };
    }
  }
  
  for (const pattern of datePatterns) {
    const match = content.match(pattern);
    if (match) {
      const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      if (date.getTime() < cutoff) {
        return {
          isTooOld: true,
          hasDate: true,
          reason: `内容日期 ${match[0]} 超过 ${maxAgeDays} 天`
        };
      } else {
        return {
          isTooOld: false,
          hasDate: true,
          reason: `内容日期 ${match[0]} 在有效期内`
        };
      }
    }
  }
  
  // 无法提取日期且不是长期有效 URL
  // 对于搜索来源，宽松处理：保留内容让 AI 判断
  // 只有明确知道内容过期才过滤
  return {
    isTooOld: false,  // 放宽限制，让 AI 分析相关性
    hasDate: false,
    reason: '无明确发布时间，保留待 AI 分析'
  };
}

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

// 从 URL 判断真实来源
function detectRealSource(url: string): 'sogou' | 'bilibili' | 'weibo' | 'zhihu' | 'toutiao' | 'douyin' | 'weixin' | 'baidu' | 'hackernews' | 'google' | 'twitter' {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('bilibili.com') || lowerUrl.includes('b23.tv')) return 'bilibili';
  if (lowerUrl.includes('weibo.com') || lowerUrl.includes('weibo.cn')) return 'weibo';
  if (lowerUrl.includes('zhihu.com')) return 'zhihu';
  if (lowerUrl.includes('toutiao.com') || lowerUrl.includes('toutiao.cn')) return 'toutiao';
  if (lowerUrl.includes('douyin.com')) return 'douyin';
  if (lowerUrl.includes('mp.weixin.qq.com')) return 'weixin';
  if (lowerUrl.includes('baidu.com')) return 'baidu';
  if (lowerUrl.includes('news.ycombinator.com') || lowerUrl.includes('hackernews')) return 'hackernews';
  if (lowerUrl.includes('google.com') || lowerUrl.includes('google.co')) return 'google';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  
  return 'sogou'; // 默认返回搜狗
}

// 从搜狗跳转链接中提取真实 URL
function extractSogouRedirectUrl(url: string): string {
  if (url.includes('/link?url=')) {
    try {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const encodedUrl = urlParams.get('url') || '';
      
      let redirectUrl = decodeURIComponent(encodedUrl);
      
      if (redirectUrl && redirectUrl.startsWith('http')) {
        return redirectUrl;
      }
      
      try {
        redirectUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
        if (redirectUrl && redirectUrl.startsWith('http')) {
          return redirectUrl;
        }
      } catch {
        // base64解码失败
      }
      
      try {
        redirectUrl = decodeURIComponent(encodedUrl.replace(/-/g, '+').replace(/_/g, '/'));
        if (redirectUrl && redirectUrl.startsWith('http')) {
          return redirectUrl;
        }
      } catch {
        // URL解码失败
      }
      
      // 解码失败时：如果URL是相对路径则拼接域名，否则直接返回
      if (url.startsWith('http')) {
        return url;
      }
      return `https://weixin.sogou.com${url}`;
    } catch {
      if (url.startsWith('http')) {
        return url;
      }
      return `https://weixin.sogou.com${url}`;
    }
  }
  return url;
}

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

const sogouLimiter = new RateLimiter(3000);
const bilibiliLimiter = new RateLimiter(2000);
const weiboLimiter = new RateLimiter(3000);
const zhihuLimiter = new RateLimiter(3000);
const toutiaoLimiter = new RateLimiter(3000);
const douyinLimiter = new RateLimiter(3000);
const baiduLimiter = new RateLimiter(5000);

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// 搜狗搜索（替代百度，反爬更宽松，无需 API Key）
// ============================================================
export async function searchSogou(query: string): Promise<SearchResult[]> {
  await sogouLimiter.wait();

  try {
    const response = await axios.get('https://www.sogou.com/web', {
      params: {
        query,
        ie: 'utf-8'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    // 搜狗搜索结果解析
    $('.vrwrap, .rb').each((_, element) => {
      const titleElement = $(element).find('h3 a, .vr-title a, .vrTitle a').first();
      const title = titleElement.text().trim();
      let originalUrl = titleElement.attr('href') || '';

      // 提取真实目标 URL
      const realUrl = extractSogouRedirectUrl(originalUrl);
      
      // 判断真实来源
      const realSource = detectRealSource(realUrl);
      
      // 如果是第三方来源（不是搜狗自己的内容），使用真实来源；否则标记为搜狗
      const source = realSource !== 'sogou' ? realSource : 'sogou';

      const snippet = $(element).find('.space-txt, .str-text-info, .str_info, .text-layout').first().text().trim()
        || $(element).find('p').first().text().trim();
      
      const cleanedSnippet = snippet
        .replace(/\s+/g, ' ')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+([.,;:!?。，；：！？])/g, '$1')
        .replace(/(https?:\/\/[^\s]+)\s*/gi, '')
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s.,;:!?。，；：！？、''""（）【】]/g, '')
        .trim()
        .substring(0, 500);

      if (!title || !realUrl || title.includes('大家还在搜') || cleanedSnippet.length < 10) {
        return;
      }
      
      const ageCheck = checkContentAge(cleanedSnippet, realUrl);
      if (ageCheck.isTooOld) {
        console.log(`[过滤] ${ageCheck.reason} - ${title}`);
        return;
      }
      
      if (!ageCheck.hasDate && !isUrlLongTermValid(realUrl)) {
        console.log(`[⚠️  无发布时间] ${title}`);
      }
      
      results.push({
        title,
        content: cleanedSnippet || title,
        url: realUrl,
        source,
        publishedAt: new Date()
      });
    });

    console.log(`Sogou search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Sogou search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// Bilibili 搜索（公开 API，无需 API Key）
// ============================================================

interface BilibiliSearchResponse {
  code: number;
  data?: {
    result?: BilibiliVideoResult[];
  };
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
  review: number; // 评论数
  danmaku: number;
  like: number;
  pubdate: number;
  tag: string;
}

interface BilibiliUserSearchResponse {
  code: number;
  data?: {
    result?: BilibiliUserResult[];
  };
}

interface BilibiliUserResult {
  mid: number;
  uname: string;
  usign: string;
  fans: number;
  videos: number;
  upic: string;
  official_verify: {
    type: number; // -1=无认证, 0=个人认证, 1=机构认证
    desc: string;
  };
}

interface BilibiliSpaceResponse {
  code: number;
  data?: {
    list?: {
      vlist?: BilibiliSpaceVideo[];
    };
  };
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

// 搜索 Bilibili 视频
export async function searchBilibili(query: string): Promise<SearchResult[]> {
  await bilibiliLimiter.wait();

  try {
    // 生成 buvid3 cookie 以避免 412 错误
    const buvid3 = `${crypto.randomUUID()}infoc`;

    const response = await axios.get<BilibiliSearchResponse>(
      'https://api.bilibili.com/x/web-interface/search/type',
      {
        params: {
          keyword: query,
          search_type: 'video',
          order: 'pubdate', // 按发布时间排序，确保获取最新内容
          page: 1,
          pagesize: 20
        },
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Referer': 'https://search.bilibili.com/',
          'Accept': 'application/json',
          'Cookie': `buvid3=${buvid3}`
        },
        timeout: 15000
      }
    );

    if (response.data.code !== 0 || !response.data.data?.result) {
      console.log(`Bilibili search: no results or API error (code: ${response.data.code})`);
      return [];
    }

    const maxAgeDays = 7;
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const results: SearchResult[] = response.data.data.result
      .filter(video => video.pubdate * 1000 >= cutoffTime)
      .map(video => ({
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
        author: {
          name: video.author,
          username: String(video.mid)
        }
      }));

    console.log(`Bilibili search for "${query}": ${response.data.data.result.length} total, ${results.length} within ${maxAgeDays} days`);
    return results;
  } catch (error) {
    console.error('Bilibili search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// 搜索 Bilibili 用户（用于账号检测）
export async function searchBilibiliUser(keyword: string): Promise<BilibiliUserResult | null> {
  await bilibiliLimiter.wait();

  try {
    const response = await axios.get<BilibiliUserSearchResponse>(
      'https://api.bilibili.com/x/web-interface/search/type',
      {
        params: {
          keyword,
          search_type: 'bili_user',
          page: 1,
          pagesize: 5
        },
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Referer': 'https://search.bilibili.com/',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.code !== 0 || !response.data.data?.result?.length) {
      return null;
    }

    // 找到名字精确匹配或高度匹配的用户
    const exactMatch = response.data.data.result.find(
      user => user.uname === keyword || user.uname.toLowerCase() === keyword.toLowerCase()
    );

    if (exactMatch) {
      return exactMatch;
    }

    // 如果第一个结果粉丝数较高且名字包含关键词，也认为是匹配
    const topResult = response.data.data.result[0];
    if (topResult.fans > 1000 && topResult.uname.includes(keyword)) {
      return topResult;
    }

    return null;
  } catch (error) {
    console.error('Bilibili user search error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// 获取 B 站用户最新视频
export async function getBilibiliUserVideos(mid: number): Promise<SearchResult[]> {
  await bilibiliLimiter.wait();

  try {
    const response = await axios.get<BilibiliSpaceResponse>(
      'https://api.bilibili.com/x/space/arc/search',
      {
        params: {
          mid,
          pn: 1,
          ps: 10,
          order: 'pubdate' // 按发布时间排序
        },
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Referer': `https://space.bilibili.com/${mid}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.code !== 0 || !response.data.data?.list?.vlist) {
      return [];
    }

    const results: SearchResult[] = response.data.data.list.vlist.map(video => ({
      title: video.title,
      content: video.description || video.title,
      url: `https://www.bilibili.com/video/${video.bvid}`,
      source: 'bilibili' as const,
      sourceId: video.bvid,
      publishedAt: new Date(video.created * 1000),
      viewCount: video.play,
      commentCount: video.comment || video.review,
      danmakuCount: video.danmaku,
      author: {
        name: video.author,
        username: String(video.mid)
      }
    }));

    console.log(`Bilibili user ${mid} videos: found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Bilibili user videos error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 微博热搜（公开API，无需登录，无需API Key）
// 通过热搜榜匹配关键词，判断话题是否在微博上热门
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
  await weiboLimiter.wait();

  try {
    // 使用微博热搜公开 API（无需登录）
    const response = await axios.get('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://weibo.com/'
      },
      timeout: 15000
    });

    if (response.data?.ok !== 1 || !response.data?.data?.realtime) {
      console.log('Weibo hot search: no data or API error');
      return [];
    }

    const hotItems: WeiboHotItem[] = response.data.data.realtime;
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    // 支持多种分隔符拆分查询词
    const queryWords = queryLower.split(/[\s\-_\/\\·#,，、]+/).filter(w => w.length >= 2);
    
    // 扩展匹配函数：支持模糊匹配（查询词包含在话题中任意位置）
    const fuzzyMatch = (topicWord: string): boolean => {
      const topicLower = topicWord.toLowerCase();
      
      // 1. 精确包含：话题包含查询词或查询词包含话题
      const exactMatch = queryWords.some(qw => topicLower.includes(qw) || qw.includes(topicLower))
        || topicLower.includes(queryLower)
        || queryLower.includes(topicLower);
      if (exactMatch) return true;
      
      // 2. 任意查询词的部分字符匹配（处理缩写、简称）
      // 例如查询 "英伟达" 匹配 "NVIDIA"
      for (const qw of queryWords) {
        // 判断是否为纯英文词
        const isEnglishWord = /^[a-zA-Z]+$/.test(qw);
        
        if (isEnglishWord) {
          // 英文词：使用单词边界匹配，避免 "apple" 匹配 "pineapple"
          const wordBoundaryMatch = new RegExp(`\\b${qw}\\b`, 'i').test(topicLower);
          if (wordBoundaryMatch) return true;
          
          // 英文缩写匹配：如 "AI" 匹配 "artificial intelligence"
          if (qw.length <= 3) {
            // 短词尝试作为词根匹配
            const rootMatch = topicLower.includes(qw.toLowerCase());
            if (rootMatch && topicLower.length < qw.length * 10) {
              return true;
            }
          }
        } else {
          // 中文词：提取每个字符进行匹配
          const chars = qw.match(/[\u4e00-\u9fa5]/g) || [];
          if (chars.length >= 2) {
            // 至少2个字符在话题中出现
            const matchCount = chars.filter(c => topicLower.includes(c)).length;
            if (matchCount >= Math.min(2, chars.length)) {
              return true;
            }
          }
        }
      }
      
      return false;
    };

    for (const item of hotItems) {
      const topicName = item.note || item.word || '';
      
      // 使用扩展匹配函数
      if (fuzzyMatch(topicName)) {
        const url = `https://s.weibo.com/weibo?q=${encodeURIComponent('#' + topicName + '#')}`;

        results.push({
          title: `🔥 微博热搜: ${topicName}`,
          content: `微博热搜话题「${topicName}」，热度 ${item.num?.toLocaleString() || '未知'}`,
          url,
          source: 'weibo' as const,
          viewCount: item.num || 0,
          publishedAt: new Date()
        });
      }
    }

    console.log(`Weibo hot search: ${results.length} matches for "${query}"`);
    return results;
  } catch (error) {
    console.error('Weibo hot search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 知乎搜索（通过搜狗搜索）
// ============================================================
export async function searchZhihu(query: string): Promise<SearchResult[]> {
  await zhihuLimiter.wait();

  try {
    const response = await axios.get('https://www.sogou.com/web', {
      params: {
        query: `site:zhihu.com ${query}`,
        ie: 'utf-8'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.sogou.com/'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    // 优先查找包含 zhihu.com 的链接
    $('a[href*="zhihu.com"]').each((_, element) => {
      const titleElement = $(element);
      const title = titleElement.text().trim();
      let url = titleElement.attr('href') || '';

      // 跳过非结果链接
      if (!title || title.length < 5) return;
      
      // 提取搜狗跳转链接中的真实URL
      if (url.includes('/link?url=')) {
        try {
          const urlParams = new URLSearchParams(url.split('?')[1]);
          const decodedUrl = decodeURIComponent(urlParams.get('url') || '');
          if (decodedUrl && decodedUrl.includes('zhihu.com')) {
            url = decodedUrl;
          }
        } catch {
          // 保持原 URL
        }
      }

      const snippet = $(element).closest('.vrwrap, .rb, .vr-result').find('.space-txt, .str-text-info, p').first().text().trim();

      if (title && url && url.includes('zhihu.com')) {
        results.push({
          title,
          content: snippet || title,
          url,
          source: 'zhihu' as const,
          publishedAt: new Date()
        });
      }
    });

    console.log(`Zhihu search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Zhihu search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 今日头条搜索（通过搜狗搜索，兼容性好）
// ============================================================
export async function searchToutiao(query: string): Promise<SearchResult[]> {
  await toutiaoLimiter.wait();

  try {
    // 使用搜狗搜索指定 site:toutiao.com，更稳定
    const response = await axios.get('https://www.sogou.com/web', {
      params: {
        query: `site:toutiao.com ${query}`,
        ie: 'utf-8'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.sogou.com/'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    $('.vrwrap, .rb').each((_, element) => {
      const titleElement = $(element).find('h3 a, .vr-title a').first();
      const title = titleElement.text().trim();
      let url = titleElement.attr('href') || '';

      if (!title || title.length < 5) return;

      // 提取搜狗跳转链接中的真实URL
      if (url.includes('/link?url=')) {
        url = extractSogouRedirectUrl(url);
      }

      if (!url || seenUrls.has(url) || !url.includes('toutiao.com')) return;
      seenUrls.add(url);

      const snippet = $(element).find('.space-txt, .str-text-info, p').first().text().trim();

      results.push({
        title,
        content: snippet || title,
        url,
        source: 'toutiao' as const,
        publishedAt: new Date()
      });
    });

    console.log(`Toutiao search for "${query}": found ${results.length} results`);
    return results.slice(0, 20);
  } catch (error) {
    console.error('Toutiao search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 抖音搜索（通过搜狗搜索，兼容性好）
// ============================================================
export async function searchDouyin(query: string): Promise<SearchResult[]> {
  await douyinLimiter.wait();

  try {
    // 使用搜狗搜索指定 site:douyin.com，更稳定
    const response = await axios.get('https://www.sogou.com/web', {
      params: {
        query: `site:douyin.com ${query}`,
        ie: 'utf-8'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.sogou.com/'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    $('.vrwrap, .rb').each((_, element) => {
      const titleElement = $(element).find('h3 a, .vr-title a').first();
      const title = titleElement.text().trim();
      let url = titleElement.attr('href') || '';

      if (!title || title.length < 3) return;

      // 提取搜狗跳转链接中的真实URL
      if (url.includes('/link?url=')) {
        url = extractSogouRedirectUrl(url);
      }

      if (!url || seenUrls.has(url) || !url.includes('douyin.com')) return;
      seenUrls.add(url);

      const snippet = $(element).find('.space-txt, .str-text-info, p').first().text().trim();

      results.push({
        title,
        content: snippet || title,
        url,
        source: 'douyin' as const,
        publishedAt: new Date()
      });
    });

    console.log(`Douyin search for "${query}": found ${results.length} results`);
    return results.slice(0, 20);
  } catch (error) {
    console.error('Douyin search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 微信公众号搜索（通过搜狗微信）
// ============================================================
export async function searchWeixin(query: string): Promise<SearchResult[]> {
  await sogouLimiter.wait();

  try {
    const response = await axios.get('https://weixin.sogou.com/weixin', {
      params: {
        type: 2,
        query,
        ie: 'utf8',
        s_from: 'input',
        _sug_: 'n',
        _sug_type_: ''
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://weixin.sogou.com/',
        'Cookie': `SUV=${Date.now()};`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    console.log(`[微信搜索] 响应长度: ${html.length} 字符`);
    console.log(`[微信搜索] 页面标题: ${$('title').text() || '未知'}`);

    const selectors = [
      '.news-box .news-list li',
      '.txt-box',
      '.result',
      '.vrwrap',
      '.rb',
      '.news-list li',
      '.gzh-box'
    ];

    let foundElements = false;
    
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        foundElements = true;
        console.log(`[微信搜索] 找到选择器 "${selector}" 的元素: ${elements.length} 个`);
        
        elements.each((_, element) => {
          const $element = $(element);
          
          const titleElement = $element.find('h3 a, .tit a, a.account_title, a[target="_blank"]').first();
          const title = titleElement.text().trim().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
          let url = titleElement.attr('href') || '';

          if (!title || !url || title.length < 5) {
            return;
          }

          url = extractSogouRedirectUrl(url);

          if (seenUrls.has(url)) {
            return;
          }
          seenUrls.add(url);

          const snippet = $element.find('.txt-info, .txt-desc, .desc, p, .content').first().text().trim();
          
          let authorName = $element.find('.account, .s-p, .info .name, .gzh-name').first().text().trim();
          authorName = authorName.replace(/document\.write\([^)]+\)/gi, '').trim();
          authorName = authorName.replace(/\)\s*$/, '').trim();

          if (authorName.length < 2) {
            authorName = '';
          }
          
          let timestamp: number | null = null;
          const timeHtml = $element.find('.s2, .s-p, .time').first().html() || '';
          const timestampMatch = timeHtml.match(/timeConvert\(['"]?(\d{10})['"]?\)/);
          if (timestampMatch) {
            timestamp = parseInt(timestampMatch[1]) * 1000;
          }

          const fullContent = snippet || title;
          
          if (timestamp) {
            const tsDate = new Date(timestamp);
            const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
            if (tsDate.getTime() > threeDaysAgo) {
              timestamp = null;
            }
          }
          
          const explicitDate = timestamp ? new Date(timestamp) : undefined;
          const ageCheck = checkContentAge(fullContent, url, MAX_CONTENT_AGE_DAYS, explicitDate);
          if (ageCheck.isTooOld) {
            console.log(`[微信过滤] ${ageCheck.reason} - ${title}`);
            return;
          }

          const result: SearchResult = {
            title,
            content: fullContent,
            url,
            source: 'weixin' as const,
            publishedAt: timestamp ? new Date(timestamp) : new Date()
          };
          
          if (authorName) {
            result.author = { name: authorName };
          }

          results.push(result);
        });
      }
    }

    if (!foundElements) {
      console.log('[微信搜索] 未找到匹配的元素，可能页面结构已变化或被反爬拦截');
      
      const hasCaptcha = html.includes('验证码') || html.includes('captcha') || html.includes('验证');
      if (hasCaptcha) {
        console.log('[微信搜索] 检测到验证码拦截');
      }
    }

    console.log(`Weixin search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Weixin search error:', error instanceof Error ? error.message : error);
    if (axios.isAxiosError(error)) {
      console.error('  - 状态码:', error.response?.status);
      console.error('  - 响应头:', error.response?.headers);
    }
    return [];
  }
}

// ============================================================
// 百度搜索（作为备选，更严格的反爬）
// ============================================================
export async function searchBaidu(query: string): Promise<SearchResult[]> {
  await baiduLimiter.wait();

  try {
    const response = await axios.get('https://www.baidu.com/s', {
      params: {
        wd: query,
        rn: 20,
       ie: 'utf-8'
      },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cookie': `BAIDUID=${crypto.randomUUID().replace(/-/g, '').toUpperCase()}:FG=1; BIDUPSID=${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('#content_left .result, #content_left .c-container').each((_, element) => {
      const titleElement = $(element).find('h3 a, .t a').first();
      const title = titleElement.text().trim();
      let url = titleElement.attr('href') || '';

      if (!title || !url || title.includes('百度快照') || url.includes('baidu.com/cache')) {
        return;
      }

      const snippet = $(element).find('.c-abstract, .content-right_8Zs40, .t span').first().text().trim();
      const fullContent = snippet || title;
      const ageCheck = checkContentAge(fullContent, url);
      if (ageCheck.isTooOld) {
        console.log(`[百度过滤] ${ageCheck.reason} - ${title}`);
        return;
      }

      results.push({
        title,
        content: fullContent,
        url,
        source: 'baidu' as const,
        publishedAt: new Date()
      });
    });

    console.log(`Baidu search for "${query}": found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Baidu search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ============================================================
// 账号检测与信息获取
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

// 检测关键词是否为某平台账号，并获取该账号最新内容
export async function detectAndFetchAccount(keyword: string): Promise<{
  accounts: AccountInfo[];
  results: SearchResult[];
}> {
  const accounts: AccountInfo[] = [];
  const results: SearchResult[] = [];

  // 并行检测 Bilibili 用户
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

      // 获取该用户最新视频
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
    searchWeibo(query),
    searchZhihu(query),
    searchToutiao(query),
    searchDouyin(query),
    searchWeixin(query),
    searchBaidu(query)
  ]);

  const allResults: SearchResult[] = [];
  const sourceNames = ['Sogou', 'Bilibili', 'Weibo', 'Zhihu', 'Toutiao', 'Douyin', 'Weixin', 'Baidu'];

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
