import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchHackerNews } from '../services/search.js';
import { searchSogou, searchBilibili, searchWeibo, searchWeixin, detectAndFetchAccount } from '../services/chinaSearch.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import { getRedis } from '../utils/redis.js';
import { NOTIFICATION_CONFIG, IMPORTANCE_LEVELS, NOTIFICATION_TYPES } from '../constants/notification.js';
import type { SearchResult } from '../types.js';

// 新鲜度过滤：丢弃超过指定小时数的内容
// Twitter 层面已通过 since: 限制了时间范围，这里只做兜底
const MAX_AGE_HOURS = 7 * 24; // 7天

// 内容最小长度要求（字符）
const MIN_CONTENT_LENGTH = 150;

// URL 验证：无效 URL 模式
const INVALID_URL_PATTERNS = [
  /^javascript:/i,
  /^#$/,
  /^\/\//,
  /example\.com/i,
  /test\.com/i,
  /localhost/,
  /\?utm_/i,
  /baidu\.com\/s\?/,
  /sogou\.com\/web\?/,
];

// URL 永久去重缓存：365天（即使删除数据，URL 也不会重复抓取）
const PERMANENT_DEDUP_CACHE_SECONDS = 365 * 24 * 60 * 60;

// 去重缓存键前缀：精确去重使用 url + source
const DEDUP_CACHE_PREFIX = 'hotspot:dedup:';

// 软去重缓存键前缀：标题去重使用 title + source（24小时，与删除策略一致）
const SOFT_DEDUP_CACHE_PREFIX = 'hotspot:soft:';
const SOFT_DEDUP_CACHE_SECONDS = 24 * 60 * 60;

// 检查 URL 是否有效
function isValidUrl(url: string): boolean {
  if (!url || url.length < 10) return false;
  
  for (const pattern of INVALID_URL_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.hostname.length < 4) return false;
    return true;
  } catch {
    return false;
  }
}

// 内容质量过滤：检查内容长度
function hasMinimumContent(result: SearchResult): boolean {
  const contentLength = (result.content || '').trim().length;
  return contentLength >= MIN_CONTENT_LENGTH;
}

// 增强的去重函数：使用Redis缓存实现持久化去重（批量优化版本）
async function deduplicateWithCache(
  results: SearchResult[],
  keywordId: string
): Promise<SearchResult[]> {
  if (results.length === 0) return [];
  
  // 步骤1：批量查询Redis缓存（优化N+1问题）
  const cacheKeys = results.map(item => `${DEDUP_CACHE_PREFIX}${item.source}:${item.url}`);
  const cachedResults = await getRedis().mget(cacheKeys);
  
  // 步骤2：构建缓存命中和未命中的映射
  const cacheHitSet = new Set<string>();
  const cacheMissItems: { item: SearchResult; cacheKey: string }[] = [];
  
  for (let i = 0; i < results.length; i++) {
    if (cachedResults[i]) {
      cacheHitSet.add(cacheKeys[i]);
      console.log(`  ⏭️  Skipped (cached): ${results[i].title.slice(0, 30)}...`);
    } else {
      cacheMissItems.push({ item: results[i], cacheKey: cacheKeys[i] });
    }
  }
  
  // 步骤3：批量查询数据库（优化N+1问题）
  if (cacheMissItems.length > 0) {
    // 收集所有需要查询的URL和标题
    const urls = cacheMissItems.map(({ item }) => item.url);
    const titles = cacheMissItems.map(({ item }) => item.title);
    const sources = [...new Set(cacheMissItems.map(({ item }) => item.source))];
    
    // 批量查询已存在的URL+source组合
    const existingByUrl = await prisma.hotspot.findMany({
      where: {
        OR: urls.map(url => ({ url, source: { in: sources } }))
      },
      select: { url: true, source: true }
    });
    
    // 批量查询已存在的标题+source组合
    const existingByTitle = await prisma.hotspot.findMany({
      where: {
        OR: titles.map(title => ({ title, source: { in: sources } }))
      },
      select: { title: true, source: true }
    });
    
    // 构建去重集合（使用Set提高查询效率）
    const duplicateSet = new Set<string>();
    existingByUrl.forEach(h => duplicateSet.add(`${h.source}:${h.url}`));
    existingByTitle.forEach(h => duplicateSet.add(`${h.source}:${h.title}`));
    
    // 步骤4：设置缓存并收集去重结果
    const pipeline = getRedis().pipeline();
    const dedupedResults: SearchResult[] = [];
    
    for (const { item, cacheKey } of cacheMissItems) {
      const key1 = `${item.source}:${item.url}`;
      const key2 = `${item.source}:${item.title}`;
      
      if (duplicateSet.has(key1) || duplicateSet.has(key2)) {
        // 数据库中存在，永久缓存防止后续重复（即使删除数据也不会再抓取）
        pipeline.set(cacheKey, '1', 'EX', PERMANENT_DEDUP_CACHE_SECONDS);
        console.log(`  ⏭️  Skipped (DB): ${item.title.slice(0, 30)}...`);
      } else {
        // 既不在缓存也不在数据库，添加到结果集
        dedupedResults.push(item);
        // 同样使用永久缓存
        pipeline.set(cacheKey, '1', 'EX', PERMANENT_DEDUP_CACHE_SECONDS);
      }
    }
    
    // 批量执行缓存设置
    await pipeline.exec();
    
    console.log(`  📊 Deduplication: ${results.length} → ${dedupedResults.length} (${results.length - dedupedResults.length} filtered, ${cacheHitSet.size} cached, ${cacheMissItems.length - dedupedResults.length} db filtered)`);
    
    return dedupedResults;
  }
  
  console.log(`  📊 Deduplication: ${results.length} → 0 (${results.length} cached)`);
  return [];
}

// 必须有明确时间的来源（API 或页面必定有日期）
const TIME_REQUIRED_SOURCES = ['twitter', 'hackernews', 'bilibili', 'weixin'];

// 搜索引擎来源（可能没有明确时间，需要更高相关性阈值）
const SEARCH_ENGINE_SOURCES = ['weibo', 'bing', 'google', 'sogou', 'duckduckgo'];

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  
  return results.filter(item => {
    // 信任来源必须有明确时间且在有效期内
    if (TIME_REQUIRED_SOURCES.includes(item.source)) {
      if (!item.publishedAt) {
        console.log(`  ⏭️  Skipped (${item.source} requires publishedAt): ${item.title.slice(0, 30)}...`);
        return false;
      }
      if (item.publishedAt < cutoff) {
        console.log(`  ⏭️  Skipped (expired ${MAX_AGE_HOURS}h+): ${item.title.slice(0, 30)}...`);
        return false;
      }
    }
    
    // 搜索引擎来源：如果有明确时间，检查是否过期
    if (SEARCH_ENGINE_SOURCES.includes(item.source) && item.publishedAt) {
      if (item.publishedAt < cutoff) {
        console.log(`  ⏭️  Skipped (${item.source} expired ${MAX_AGE_HOURS}h+): ${item.title.slice(0, 30)}...`);
        return false;
      }
    }
    
    return true;
  });
}

// 按来源优先级排序：Twitter > 微博 > B站/账号内容 > 微信 > 搜索引擎
function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    twitter: 1,
    weibo: 2,
    bilibili: 3,
    weixin: 4,
    hackernews: 5,
    sogou: 6,
    bing: 7,
    google: 8,
    duckduckgo: 9
  };
  
  const now = Date.now();
  
  return [...results].sort((a, b) => {
    // 首先按来源优先级
    const sourcePriorityDiff = (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
    if (sourcePriorityDiff !== 0) return sourcePriorityDiff;
    
    // 同等优先级时，按时效性排序（越新越好）
    const aAge = a.publishedAt ? now - new Date(a.publishedAt).getTime() : Infinity;
    const bAge = b.publishedAt ? now - new Date(b.publishedAt).getTime() : Infinity;
    return aAge - bAge;
  });
}

// 实时软去重函数：清理同一标题+来源的重复记录
// 保留最新插入的记录，删除其他的
// 注意：这是系统自动去重，不清理软去重缓存
// 因为新插入的记录会在 deduplicateWithCache 中自动设置24小时缓存
// 如果删除缓存，可能导致短暂的去重失效窗口
async function cleanupRecentDuplicates(
  newestId: string,
  title: string,
  source: string
): Promise<number> {
  try {
    // 删除相同 title + source 的旧记录（保留传入的这条）
    const result = await prisma.hotspot.deleteMany({
      where: {
        title: title,
        source: source,
        NOT: { id: newestId }
      }
    });
    
    if (result.count > 0) {
      console.log(`  🧹 Soft deduplication: removed ${result.count} duplicate(s) for "${title.slice(0, 30)}..."`);
    }
    
    return result.count;
  } catch (error) {
    console.error(`  ⚠️  Failed to cleanup duplicates for "${title.slice(0, 30)}":`, error);
    return 0;
  }
}

export async function runHotspotCheck(io: Server): Promise<void> {
  console.log('🔍 Starting hotspot check...');

  // 获取所有激活的关键词
  const keywords = await prisma.keyword.findMany({
    where: { isActive: true }
  });

  if (keywords.length === 0) {
    console.log('No active keywords to monitor');
    return;
  }

  console.log(`Checking ${keywords.length} keywords...`);

  let newHotspotsCount = 0;

  // 批量并行处理关键词（优化串行处理，每个批次5个关键词）
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 2000; // 每批次间隔2秒，避免API限流

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keywords.length / BATCH_SIZE)}: ${batch.map(k => k.text).join(', ')}`);

    // 并行处理当前批次的所有关键词
    const batchResults = await Promise.allSettled(
      batch.map(async (keyword) => {
        try {
          return await processKeyword(keyword, io);
        } catch (error) {
          console.error(`  ❌ Error processing keyword "${keyword.text}":`, error);
          return 0;
        }
      })
    );

    // 统计批次结果
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        newHotspotsCount += result.value;
      }
    }

    // 批次间延迟（避免API限流）
    if (i + BATCH_SIZE < keywords.length) {
      console.log(`  ⏳ Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}

// 单独处理单个关键词的函数（从原runHotspotCheck提取）
async function processKeyword(keyword: { id: string; text: string }, io: Server): Promise<number> {
  let keywordNewHotspots = 0;
  console.log(`\n📎 Checking keyword: "${keyword.text}"`);

  try {
    console.log(`  🎯 Detecting account for "${keyword.text}"...`);
    const accountResult = await detectAndFetchAccount(keyword.text);
    
    if (accountResult.accounts.length > 0) {
      for (const acc of accountResult.accounts) {
        console.log(`  ✅ Found ${acc.platform} account: ${acc.name} (${acc.followers} followers)`);
      }
    }

    console.log(`  🔍 Expanding keyword "${keyword.text}"...`);
    const expandedKeywords = await expandKeyword(keyword.text);
    console.log(`  📋 Expanded to ${expandedKeywords.length} variants: ${expandedKeywords.slice(0, 5).join(', ')}${expandedKeywords.length > 5 ? '...' : ''}`);

    const [
      twitterResults,
      bingResults,
      hackernewsResults,
      sogouResults,
      bilibiliResults,
      weiboResults,
      weixinResults
    ] = await Promise.allSettled([
      searchTwitter(keyword.text),
      searchBing(keyword.text),
      searchHackerNews(keyword.text),
      searchSogou(keyword.text),
      searchBilibili(keyword.text),
      searchWeibo(keyword.text),
      searchWeixin(keyword.text)
    ]);

    const allResults: SearchResult[] = [];
    
    if (accountResult.results.length > 0) {
      allResults.push(...accountResult.results);
      console.log(`  AccountFetch: ${accountResult.results.length} results`);
    }

    const sources = [
      { name: 'Twitter', result: twitterResults },
      { name: 'Bing', result: bingResults },
      { name: 'HackerNews', result: hackernewsResults },
      { name: 'Sogou', result: sogouResults },
      { name: 'Bilibili', result: bilibiliResults },
      { name: 'Weibo', result: weiboResults },
      { name: 'Weixin', result: weixinResults }
    ];

    for (const source of sources) {
      if (source.result.status === 'fulfilled') {
        allResults.push(...source.result.value);
        console.log(`  ${source.name}: ${source.result.value.length} results`);
      } else {
        const errorMsg = source.result.reason instanceof Error 
          ? source.result.reason.message 
          : String(source.result.reason || 'Unknown error');
        console.log(`  ${source.name}: failed - ${errorMsg}`);
      }
    }

    const uniqueResults = await deduplicateWithCache(allResults, keyword.id);
    const freshResults = filterByFreshness(uniqueResults);
    
    // 过滤无效 URL 和内容过短的数据
    const validResults = freshResults.filter(result => {
      if (!isValidUrl(result.url)) {
        console.log(`  ⏭️  Skipped (invalid URL): ${result.title.slice(0, 30)}...`);
        return false;
      }
      if (!hasMinimumContent(result)) {
        console.log(`  ⏭️  Skipped (content too short ${(result.content || '').length} chars): ${result.title.slice(0, 30)}...`);
        return false;
      }
      return true;
    });
    
    const sortedResults = prioritizeResults(validResults);
    console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh → ${validResults.length} valid (${MIN_CONTENT_LENGTH}+ chars, valid URL)`);

    let twitterProcessed = 0;
    let otherProcessed = 0;
    let skippedByQuota = 0;
    const TWITTER_QUOTA = 20;
    const OTHER_QUOTA = 15;

    for (const item of sortedResults) {
      if (item.source === 'twitter' && twitterProcessed >= TWITTER_QUOTA) {
        skippedByQuota++;
        continue;
      }
      if (item.source !== 'twitter' && otherProcessed >= OTHER_QUOTA) {
        skippedByQuota++;
        continue;
      }
      if (twitterProcessed + otherProcessed >= TWITTER_QUOTA + OTHER_QUOTA) break;
      
      try {
        const fullText = item.title + '\n' + item.content;
        const preMatch = preMatchKeyword(fullText, expandedKeywords);
        const analysis = await analyzeContent(fullText, keyword.text, preMatch);

        if (!analysis.isReal) {
          console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
          continue;
        }

        // 对搜索引擎来源且没有明确时间的内容，要求更高的相关性阈值
        const isSearchEngineWithoutTime = SEARCH_ENGINE_SOURCES.includes(item.source) && !item.publishedAt;
        const minRelevanceThreshold = isSearchEngineWithoutTime ? 70 : 50;
        const minRelevanceWithKeyword = isSearchEngineWithoutTime ? 80 : 65;

        if (analysis.relevance < minRelevanceThreshold) {
          console.log(`  ⏭ Low relevance ${analysis.relevance}% (min ${minRelevanceThreshold}%): ${item.title.slice(0, 30)}...`);
          continue;
        }

        if (!analysis.keywordMentioned && analysis.relevance < minRelevanceWithKeyword) {
          console.log(`  ⏭ Keyword not mentioned & relevance ${analysis.relevance}% < ${minRelevanceWithKeyword}%: ${item.title.slice(0, 30)}...`);
          continue;
        }

        let hotspot;
        let isNewHotspot = false;
        
        try {
          hotspot = await prisma.hotspot.upsert({
            where: { url_source: { url: item.url, source: item.source } },
            create: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceId: item.sourceId || null,
              isReal: analysis.isReal,
              relevance: analysis.relevance,
              relevanceReason: analysis.relevanceReason || null,
              keywordMentioned: analysis.keywordMentioned ?? null,
              importance: analysis.importance,
              summary: analysis.summary,
              viewCount: item.viewCount || null,
              likeCount: item.likeCount || null,
              retweetCount: item.retweetCount || null,
              replyCount: item.replyCount || null,
              commentCount: item.commentCount || null,
              quoteCount: item.quoteCount || null,
              danmakuCount: item.danmakuCount || null,
              authorName: item.author?.name || null,
              authorUsername: item.author?.username || null,
              authorAvatar: item.author?.avatar || null,
              authorFollowers: item.author?.followers || null,
              authorVerified: item.author?.verified ?? null,
              publishedAt: item.publishedAt || null,
              keywordId: keyword.id
            },
            update: {},
            include: { keyword: true }
          });
          
          const createdAt = hotspot.createdAt.getTime();
          const now = Date.now();
          isNewHotspot = (now - createdAt) < 1000;
          
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002') {
            console.log(`  ⏭️  Skipped (duplicate): ${item.title.slice(0, 30)}...`);
            continue;
          }
          throw error;
        }

        if (isNewHotspot) {
          keywordNewHotspots++;
          if (item.source === 'twitter') twitterProcessed++;
          else otherProcessed++;
          console.log(`  ✅ New hotspot [${item.source}]: ${hotspot.title.slice(0, 40)}... (${analysis.importance})`);

          try {
            await cleanupRecentDuplicates(hotspot.id, hotspot.title, hotspot.source);
          } catch (error) {
            console.error(`  ⚠️  Soft deduplication error:`, error);
          }

          let notificationCreated = false;
          try {
            await prisma.notification.upsert({
              where: { hotspotId: hotspot.id },
              create: {
                type: NOTIFICATION_TYPES.HOTSPOT,
                title: `发现新热点: ${hotspot.title.slice(0, NOTIFICATION_CONFIG.TITLE_MAX_LENGTH)}`,
                content: analysis.summary || hotspot.content.slice(0, NOTIFICATION_CONFIG.CONTENT_MAX_LENGTH),
                hotspotId: hotspot.id
              },
              update: {}
            });
            notificationCreated = true;
          } catch (error: unknown) {
             const err = error as { code?: string };
             if (err.code === 'P2002') {
              console.log(`  ⏭️  Notification already exists for hotspot: ${hotspot.id}`);
            } else {
              console.error(`  ⚠️  Notification creation error:`, error);
            }
          }

          if (notificationCreated) {
            io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
            io.emit('notification', {
              type: NOTIFICATION_TYPES.HOTSPOT,
              title: '发现新热点',
              content: hotspot.title,
              hotspotId: hotspot.id,
              importance: hotspot.importance
            });
          }

          if ([IMPORTANCE_LEVELS.HIGH, IMPORTANCE_LEVELS.URGENT].includes(analysis.importance as any)) {
            await sendHotspotEmail(hotspot);
          }
        }

      } catch (error) {
        console.error(`  Error processing result:`, error);
      }
    }

    if (skippedByQuota > 0) {
      console.log(`  ⏭ Total skipped by quota: ${skippedByQuota} (Twitter: ${twitterProcessed}/${TWITTER_QUOTA}, Other: ${otherProcessed}/${OTHER_QUOTA})`);
    } else if (twitterProcessed > 0 || otherProcessed > 0) {
      console.log(`  📊 Quota used: Twitter ${twitterProcessed}/${TWITTER_QUOTA}, Other ${otherProcessed}/${OTHER_QUOTA}`);
    }

    return keywordNewHotspots;

  } catch (error) {
    console.error(`Error checking keyword "${keyword.text}":`, error);
    return keywordNewHotspots;
  }
}
