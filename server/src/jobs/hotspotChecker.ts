import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchHackerNews, deduplicateResults, normalizeUrlForDeduplication, generateContentFingerprint } from '../services/search.js';
import { searchSogou, searchBilibili, searchWeibo, searchWeixin, searchZhihu, searchToutiao, searchDouyin, searchBaidu, detectAndFetchAccount, MAX_CONTENT_AGE_DAYS } from '../services/chinaSearch.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import { checkUrlQuality, isContentTooOld } from '../utils/urlValidator.js';
import type { SearchResult } from '../types.js';

// 新鲜度过滤：丢弃超过指定小时数的内容
// Twitter 层面已通过 since: 限制了时间范围，这里只做兜底
const MAX_AGE_HOURS = 7 * 24; // 7天

// 热度分数计算：基于互动数据计算热度
function calculateHeatScore(item: SearchResult): number {
  const likes = item.likeCount ?? 0;
  const retweets = item.retweetCount ?? 0;
  const replies = item.replyCount ?? 0;
  const comments = item.commentCount ?? 0;
  const quotes = item.quoteCount ?? 0;
  const views = item.viewCount ?? 0;
  const raw = likes * 2 + retweets * 3 + replies * 1.5 + comments * 1.5 + quotes * 2 + views / 100;
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}

// 获取热度等级
function getHeatLevel(score: number): string {
  if (score >= 80) return '爆';
  if (score >= 60) return '热';
  if (score >= 40) return '温';
  if (score >= 20) return '凉';
  return '冷';
}

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    // 没有发布时间的，暂时保留（搜索引擎结果通常没有时间）
    if (!item.publishedAt) return true;
    return item.publishedAt >= cutoff;
  });
}

// 按来源优先级排序：Twitter > 微博 > B站/账号内容 > 搜索引擎 > 其他
function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    twitter: 1,
    weibo: 2,
    bilibili: 3,
    hackernews: 4,
    zhihu: 5,
    toutiao: 6,
    douyin: 7,
    weixin: 8,
    sogou: 9,
    baidu: 10,
    bing: 11,
    google: 12,
    duckduckgo: 13,
    channels: 14
  };
  return [...results].sort((a, b) => {
    return (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
  });
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
  let totalProcessed = 0;
  let totalFiltered = 0;
  const filterStats = {
    urlQuality: 0,
    contentAge: 0,
    duplicate: 0,
    notReal: 0,
    aiDate: 0,
    relevance: 0,
    keywordMentioned: 0,
    importance: 0,
    heatLevel: 0,
    quota: 0,
    error: 0
  };

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
        weixinResults,
        zhihuResults,
        toutiaoResults,
        douyinResults,
        baiduResults
      ] = await Promise.allSettled([
        searchTwitter(keyword.text),
        searchBing(keyword.text),
        searchHackerNews(keyword.text),
        searchSogou(keyword.text),
        searchBilibili(keyword.text),
        searchWeibo(keyword.text),
        searchWeixin(keyword.text),
        searchZhihu(keyword.text),
        searchToutiao(keyword.text),
        searchDouyin(keyword.text),
        searchBaidu(keyword.text)
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
        { name: 'Weixin', result: weixinResults },
        { name: 'Zhihu', result: zhihuResults },
        { name: 'Toutiao', result: toutiaoResults },
        { name: 'Douyin', result: douyinResults },
        { name: 'Baidu', result: baiduResults }
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
      const uniqueResults = deduplicateResults(allResults);
      const freshResults = filterByFreshness(uniqueResults);
      const sortedResults = prioritizeResults(freshResults);
      console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh (within ${MAX_AGE_HOURS}h)`);

      // 处理结果：Twitter 优先多给配额
      // Twitter 最多处理 20 条，其他来源共享 15 条配额（增加以提高收录率）
      let twitterProcessed = 0;
      let otherProcessed = 0;
      const TWITTER_QUOTA = 20;  // 从 15 增加到 20
      const OTHER_QUOTA = 15;     // 从 10 增加到 15
      const TOTAL_QUOTA = TWITTER_QUOTA + OTHER_QUOTA;

      for (const item of sortedResults) {
        // 精确的配额检查
        if (item.source === 'twitter') {
          if (twitterProcessed >= TWITTER_QUOTA) {
            filterStats.quota++;
            continue;
          }
        } else {
          if (otherProcessed >= OTHER_QUOTA) {
            filterStats.quota++;
            continue;
          }
        }
        if (twitterProcessed + otherProcessed >= TOTAL_QUOTA) {
          filterStats.quota++;
          break;
        }
        totalProcessed++;
        
        try {
          const contentFingerprint = generateContentFingerprint(item.title, item.content);
          
          let existing = await prisma.hotspot.findFirst({
            where: {
              isDeleted: false,  // 排除已删除的记录
              OR: [
                { url: item.url, source: item.source },
                { fingerprint: contentFingerprint }
              ]
            }
          });
          
          if (!existing) {
            const normalizedUrl = normalizeUrlForDeduplication(item.url);
            existing = await prisma.hotspot.findFirst({
              where: {
                isDeleted: false,  // 排除已删除的记录
                url: { startsWith: normalizedUrl },
                source: item.source
              }
            });
          }

          if (existing) {
            filterStats.duplicate++;
            totalFiltered++;
            continue;
          }

          // 先做快速检查：URL质量检查（避免浪费AI资源
          const urlQuality = checkUrlQuality(item.url, MAX_CONTENT_AGE_DAYS);
          if (!urlQuality.valid) {
            filterStats.urlQuality++;
            totalFiltered++;
            continue;
          }

          // 内容时间检测：从标题和内容中提取日期，过滤过旧的内容
          const fullText = item.title + '\n' + item.content;
          const contentCheck = isContentTooOld(fullText, MAX_CONTENT_AGE_DAYS);
          if (contentCheck.tooOld) {
            filterStats.contentAge++;
            totalFiltered++;
            continue;
          }

          // 最后才做AI分析（资源消耗大）
          const preMatch = preMatchKeyword(fullText, expandedKeywords);
          const analysis = await analyzeContent(fullText, keyword.text, preMatch);

          // 只保存真实且相关的热点
          if (!analysis.isReal) {
            filterStats.notReal++;
            totalFiltered++;
            continue;
          }

          // AI 提取的发布时间检查
          if (analysis.publishedDate && analysis.dateConfidence) {
            const aiPublishDate = new Date(analysis.publishedDate);
            if (!isNaN(aiPublishDate.getTime())) {
              item.publishedAt = aiPublishDate;
              const cutoff = new Date(Date.now() - MAX_CONTENT_AGE_DAYS * 24 * 60 * 60 * 1000);
              if (aiPublishDate < cutoff) {
                filterStats.aiDate++;
                totalFiltered++;
                continue;
              }
            }
          }

          // 相关性阈值：从 50 降低到 40，提高收录率
          if (analysis.relevance < 40) {
            filterStats.relevance++;
            totalFiltered++;
            continue;
          }

          // 放宽规则：关键词未被提及但相关性 >= 40 时也保留（降级模式可能无法检测到关键词）
          // 只有当相关性 < 40 时才过滤（无论关键词是否提及）
          if (!analysis.keywordMentioned && analysis.relevance < 40) {
            filterStats.keywordMentioned++;
            totalFiltered++;
            continue;
          }

          // 重要性过滤：仅 urgent 级别才会被直接排除，low/medium/high 都保留
          // 将 importance === 'low' 改为 medium 以下且无热度时过滤
          const heatScore = calculateHeatScore(item);
          const heatLevel = getHeatLevel(heatScore);
          if (analysis.importance === 'low' && heatLevel === '冷') {
            filterStats.importance++;
            totalFiltered++;
            continue;
          }

          // 热度过滤：只有"冷"级别才过滤（从"凉/冷"放宽为仅"冷"）
          // 微信公众号文章通常没有公开的互动数据，跳过热度过滤
          if (item.source !== 'weixin' && heatLevel === '冷') {
            filterStats.heatLevel++;
            totalFiltered++;
            continue;
          }

          // 保存热点
          const hotspot = await prisma.hotspot.create({
            data: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceId: item.sourceId || null,
              fingerprint: contentFingerprint,
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
            include: {
              Keyword: true
            }
          });

          newHotspotsCount++;
          if (item.source === 'twitter') twitterProcessed++;
          else otherProcessed++;
          console.log(`  ✅ New hotspot [${item.source}]: ${hotspot.title.slice(0, 40)}... (importance=${analysis.importance}, relevance=${analysis.relevance}, heat=${heatLevel})`);

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
          filterStats.error++;
          totalFiltered++;
          console.error(`  Error processing result:`, error);
          continue;
        }
      }

      // 避免过快请求
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }

  // 输出汇总统计
  const totalItems = totalProcessed + totalFiltered;
  console.log('\n📊 Filter Statistics:');
  console.log(`  Total items: ${totalItems}`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total filtered: ${totalFiltered}`);
  console.log(`  Saved as hotspot: ${newHotspotsCount}`);
  console.log(`  Pass rate: ${totalProcessed > 0 ? ((newHotspotsCount / totalProcessed) * 100).toFixed(1) : 0}%`);
  console.log('\n  Filter breakdown:');
  console.log(`    - Quota limit: ${filterStats.quota}`);
  console.log(`    - Duplicate: ${filterStats.duplicate}`);
  console.log(`    - URL quality: ${filterStats.urlQuality}`);
  console.log(`    - Content age: ${filterStats.contentAge}`);
  console.log(`    - Not real/spam: ${filterStats.notReal}`);
  console.log(`    - AI date outdated: ${filterStats.aiDate}`);
  console.log(`    - Low relevance (<40): ${filterStats.relevance}`);
  console.log(`    - Keyword not mentioned & relevance <55: ${filterStats.keywordMentioned}`);
  console.log(`    - Low importance & cold: ${filterStats.importance}`);
  console.log(`    - Cold heat level: ${filterStats.heatLevel}`);
  console.log(`    - Processing errors: ${filterStats.error}`);

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}
