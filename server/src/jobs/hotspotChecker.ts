import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchHackerNews, deduplicateResults } from '../services/search.js';
import { searchSogou, searchBilibili, searchWeibo, searchWeixin, detectAndFetchAccount } from '../services/chinaSearch.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import { redisClient as redis } from '../utils/redis.js';
import type { SearchResult } from '../types.js';

// 新鲜度过滤：丢弃超过指定小时数的内容
// Twitter 层面已通过 since: 限制了时间范围，这里只做兜底
const MAX_AGE_HOURS = 7 * 24; // 7天

// 缓存过期时间：24小时（与软去重时间窗口一致）
const CACHE_EXPIRE_SECONDS = 24 * 60 * 60;

// 去重缓存键前缀
const DEDUP_CACHE_PREFIX = 'hotspot:dedup:';

// 增强的去重函数：使用Redis缓存实现持久化去重
async function deduplicateWithCache(
  results: SearchResult[],
  keywordId: string
): Promise<SearchResult[]> {
  if (results.length === 0) return [];
  
  const dedupedResults: SearchResult[] = [];
  const cacheKeys: string[] = [];
  
  for (const item of results) {
    // 生成缓存键：使用 title + source 作为去重依据
    const cacheKey = `${DEDUP_CACHE_PREFIX}${item.source}:${item.title}`;
    cacheKeys.push(cacheKey);
    
    try {
      // 检查Redis缓存
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        // 缓存命中，说明已存在，跳过
        console.log(`  ⏭️  Skipped (cached): ${item.title.slice(0, 30)}...`);
        continue;
      }
      
      // 检查数据库（作为兜底）
      const existing = await prisma.hotspot.findFirst({
        where: {
          OR: [
            { url: item.url, source: item.source },
            { title: item.title, source: item.source }
          ]
        }
      });
      
      if (existing) {
        // 数据库中存在，设置缓存防止后续重复
        await redis.setEx(cacheKey, CACHE_EXPIRE_SECONDS, '1');
        console.log(`  ⏭️  Skipped (DB): ${item.title.slice(0, 30)}...`);
        continue;
      }
      
      // 既不在缓存也不在数据库，添加到结果集
      dedupedResults.push(item);
      
      // 设置缓存
      await redis.setEx(cacheKey, CACHE_EXPIRE_SECONDS, '1');
      
    } catch (error) {
      // Redis出错时，保守处理：跳过该项
      console.error(`  ⚠️  Cache error for ${item.title.slice(0, 30)}:`, error);
      // 仍然检查数据库
      const existing = await prisma.hotspot.findFirst({
        where: {
          OR: [
            { url: item.url, source: item.source },
            { title: item.title, source: item.source }
          ]
        }
      });
      
      if (!existing) {
        dedupedResults.push(item);
      }
    }
  }
  
  console.log(`  📊 Deduplication: ${results.length} → ${dedupedResults.length} (${results.length - dedupedResults.length} filtered)`);
  
  return dedupedResults;
}

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    // 没有发布时间的，暂时保留（搜索引擎结果通常没有时间）
    if (!item.publishedAt) return true;
    return item.publishedAt >= cutoff;
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
  return [...results].sort((a, b) => {
    return (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
  });
}

// 实时软去重函数：清理同一标题+来源的重复记录
// 保留最新插入的记录，删除其他的
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
      
      // 同时清理这些记录的通知
      // 注意：这里只清理了重复的热点，没清理通知（通知可能需要单独处理）
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

  for (const keyword of keywords) {
    console.log(`\n📎 Checking keyword: "${keyword.text}"`);

    try {
      // 第一步：检测关键词是否为某个平台账号
      console.log(`  🎯 Detecting account for "${keyword.text}"...`);
      const accountResult = await detectAndFetchAccount(keyword.text);
      
      if (accountResult.accounts.length > 0) {
        for (const acc of accountResult.accounts) {
          console.log(`  ✅ Found ${acc.platform} account: ${acc.name} (${acc.followers} followers)`);
        }
      }

      // 第 1.5 步：Query Expansion（查询扩展）
      console.log(`  🔍 Expanding keyword "${keyword.text}"...`);
      const expandedKeywords = await expandKeyword(keyword.text);
      console.log(`  📋 Expanded to ${expandedKeywords.length} variants: ${expandedKeywords.slice(0, 5).join(', ')}${expandedKeywords.length > 5 ? '...' : ''}`);

      // 第二步：从多个来源获取数据（国际 + 国内并行请求）
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
      
      // 优先添加账号检测到的最新内容
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
          console.log(`  ${source.name}: failed - ${source.result.reason}`);
        }
      }

      // 去重 → 新鲜度过滤 → 按来源优先级排序
      // 使用增强的去重函数（Redis缓存 + 数据库兜底）
      const uniqueResults = await deduplicateWithCache(allResults, keyword.id);
      const freshResults = filterByFreshness(uniqueResults);
      const sortedResults = prioritizeResults(freshResults);
      console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh (within ${MAX_AGE_HOURS}h)`);

      // 处理结果：Twitter 优先多给配额
      // Twitter 最多处理 20 条，其他来源共享 15 条配额
      let twitterProcessed = 0;
      let otherProcessed = 0;
      let skippedByQuota = 0;
      const TWITTER_QUOTA = 20;
      const OTHER_QUOTA = 15;

      for (const item of sortedResults) {
        // 检查配额
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
          // AI 分析（传入关键词和预匹配结果）
          const fullText = item.title + '\n' + item.content;
          const preMatch = preMatchKeyword(fullText, expandedKeywords);
          const analysis = await analyzeContent(fullText, keyword.text, preMatch);

          // 只保存真实且相关的热点
          if (!analysis.isReal) {
            console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 相关性阈值：50 分以下过滤
          if (analysis.relevance < 50) {
            console.log(`  ⏭ Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 额外规则：关键词未被提及且相关性不足 65 → 过滤
          if (!analysis.keywordMentioned && analysis.relevance < 65) {
            console.log(`  ⏭ Keyword not mentioned & relevance < 65 (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 保存热点（使用upsert防止并发重复）
          // 同时使用 url+source 和 title+source 作为唯一键
          let hotspot;
          try {
            hotspot = await prisma.hotspot.upsert({
              where: {
                url_source: {
                  url: item.url,
                  source: item.source
                }
              },
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
              update: {},  // 已存在则不更新
              include: {
                keyword: true
              }
            });
          } catch (error) {
            // 如果是唯一约束冲突，说明并发情况下已存在
            if ((error as { code?: string }).code === 'P2002') {
              console.log(`  ⏭️  Skipped (duplicate): ${item.title.slice(0, 30)}...`);
              continue;
            }
            throw error;
          }

          newHotspotsCount++;
          if (item.source === 'twitter') twitterProcessed++;
          else otherProcessed++;
          console.log(`  ✅ New hotspot [${item.source}]: ${hotspot.title.slice(0, 40)}... (${analysis.importance})`);

          // 实时软去重：清理该标题的其他重复记录（保留最新插入的这条）
          try {
            await cleanupRecentDuplicates(hotspot.id, hotspot.title, hotspot.source);
          } catch (error) {
            console.error(`  ⚠️  Soft deduplication error:`, error);
          }

          // 创建通知
          await prisma.notification.create({
            data: {
              type: 'hotspot',
              title: `发现新热点: ${hotspot.title.slice(0, 50)}`,
              content: analysis.summary || hotspot.content.slice(0, 100),
              hotspotId: hotspot.id
            }
          });

          // WebSocket 通知
          io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
          io.emit('notification', {
            type: 'hotspot',
            title: '发现新热点',
            content: hotspot.title,
            hotspotId: hotspot.id,
            importance: hotspot.importance
          });

          // 邮件通知（仅对高重要级别）
          if (['high', 'urgent'].includes(analysis.importance)) {
            await sendHotspotEmail(hotspot);
          }

        } catch (error) {
          console.error(`  Error processing result:`, error);
        }
      }

      // 输出配额统计
      if (skippedByQuota > 0) {
        console.log(`  ⏭ Total skipped by quota: ${skippedByQuota} (Twitter: ${twitterProcessed}/${TWITTER_QUOTA}, Other: ${otherProcessed}/${OTHER_QUOTA})`);
      } else if (twitterProcessed > 0 || otherProcessed > 0) {
        console.log(`  📊 Quota used: Twitter ${twitterProcessed}/${TWITTER_QUOTA}, Other ${otherProcessed}/${OTHER_QUOTA}`);
      }

      // 避免过快请求
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}
