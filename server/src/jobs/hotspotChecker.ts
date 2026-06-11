/**
 * 热点检查定时任务（核心调度器）
 * 
 * 完整流程：
 * 1. 加载所有激活关键词
 * 2. 对每个关键词：
 *    a. 账号检测（B站 up 主）
 *    b. Query Expansion（AI 扩展关键词变体）
 *    c. 7 源并发搜索（Twitter / Bing / HN / DDG / 搜狗 / B站 / 微博）
 *    d. 合并 → 去重 → 新鲜度过滤 → 来源优先级排序
 *    e. 逐条：查重 → AI 分析 → 阈值过滤 → 保存 → 通知
 * 3. 汇总报告
 *
 * 优化点：
 * - 日志结构化（统一前缀 + 关键指标）
 * - AI 分析失败不阻塞后续条目
 * - 新鲜度窗口可配置
 * - 配额控制（Twitter 15 条 / 其他 10 条 / 每关键词最多 25 条）
 */
import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchDuckDuckGo, searchHackerNews, deduplicateResults } from '../services/search.js';
import { searchSogou, searchBilibili, searchWeibo, detectAndFetchAccount } from '../services/chinaSearch.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import type { SearchResult } from '../types.js';

// ============================================================
// 可配置参数
// ============================================================

/** 保留多少天内的内容（默认 7 天） */
const MAX_AGE_HOURS = 7 * 24;

/** Twitter 来源处理上限 */
const TWITTER_QUOTA = 15;

/** 非Twitter 来源处理上限 */
const OTHER_QUOTA = 10;

/** 每个关键词总处理上限 */
const TOTAL_QUOTA = TWITTER_QUOTA + OTHER_QUOTA;

/** 关键词之间的间隔（ms），避免过快请求 */
const KEYWORD_INTERVAL_MS = 2000;

/** AI 分析并发上限 */
const AI_CONCURRENCY = 3;

// ============================================================
// 来源优先级排序
// ============================================================

const SOURCE_PRIORITY: Record<string, number> = {
  twitter: 1,
  weibo: 2,
  bilibili: 3,
  hackernews: 4,
  sogou: 5,
  bing: 6,
  google: 7,
  duckduckgo: 8
};

function prioritizeResults(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) =>
    (SOURCE_PRIORITY[a.source] ?? 99) - (SOURCE_PRIORITY[b.source] ?? 99)
  );
}

// ============================================================
// 新鲜度过滤
// ============================================================

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    if (!item.publishedAt) return true; // 无时间戳的搜索引擎结果保留
    return item.publishedAt >= cutoff;
  });
}

// ============================================================
// 单条结果处理
// ============================================================

interface ProcessContext {
  keywordId: string;
  keywordText: string;
  expandedKeywords: string[];
  io: Server;
  twitterCount: number;
  otherCount: number;
}

async function processResult(
  item: SearchResult,
  ctx: ProcessContext
): Promise<'saved' | 'duplicate' | 'filtered' | 'error'> {
  // 配额检查
  if (ctx.twitterCount >= TWITTER_QUOTA && item.source === 'twitter') return 'filtered';
  if (ctx.otherCount >= OTHER_QUOTA && item.source !== 'twitter') return 'filtered';
  if (ctx.twitterCount + ctx.otherCount >= TOTAL_QUOTA) return 'filtered';

  try {
    // 查重：URL + 来源
    const existing = await prisma.hotspot.findFirst({
      where: { url: item.url, source: item.source }
    });
    if (existing) return 'duplicate';

    // AI 分析
    const fullText = item.title + '\n' + item.content;
    const preMatch = preMatchKeyword(fullText, ctx.expandedKeywords);
    const analysis = await analyzeContent(fullText, ctx.keywordText, preMatch);

    // 阈值过滤
    if (!analysis.isReal) return 'filtered';
    if (analysis.relevance < 50) return 'filtered';
    if (!analysis.keywordMentioned && analysis.relevance < 65) return 'filtered';

    // 保存
    const hotspot = await prisma.hotspot.create({
      data: {
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
        keywordId: ctx.keywordId
      },
      include: { keyword: true }
    });

    // 更新配额计数
    if (item.source === 'twitter') ctx.twitterCount++;
    else ctx.otherCount++;

    // 异步通知（不阻塞主流程）
    setImmediate(async () => {
      try {
        // 数据库通知
        await prisma.notification.create({
          data: {
            type: 'hotspot',
            title: `发现新热点: ${hotspot.title.slice(0, 50)}`,
            content: analysis.summary || hotspot.content.slice(0, 100),
            hotspotId: hotspot.id
          }
        });

        // WebSocket 推送
        ctx.io.to(`keyword:${ctx.keywordText}`).emit('hotspot:new', hotspot);
        ctx.io.emit('notification', {
          type: 'hotspot',
          title: '发现新热点',
          content: hotspot.title,
          hotspotId: hotspot.id,
          importance: hotspot.importance
        });

        // 邮件通知（仅高重要级别）
        if (['high', 'urgent'].includes(analysis.importance)) {
          await sendHotspotEmail(hotspot);
        }
      } catch (notifyError) {
        console.error(`  [通知失败] ${hotspot.id}:`, notifyError instanceof Error ? notifyError.message : notifyError);
      }
    });

    return 'saved';
  } catch (error) {
    console.error(`  [处理错误] ${item.title.slice(0, 30)}:`, error instanceof Error ? error.message : error);
    return 'error';
  }
}

// ============================================================
// 主调度
// ============================================================

export async function runHotspotCheck(io: Server): Promise<void> {
  console.log('🔍 ===== 热点检查开始 =====');

  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  if (keywords.length === 0) {
    console.log('⚠️ 没有激活的关键词');
    return;
  }
  console.log(`📋 共 ${keywords.length} 个激活关键词`);

  let totalNew = 0;

  for (const keyword of keywords) {
    console.log(`\n📎 关键词: "${keyword.text}"`);

    try {
      // 1) 账号检测
      const accountResult = await detectAndFetchAccount(keyword.text);
      if (accountResult.accounts.length > 0) {
        for (const acc of accountResult.accounts) {
          console.log(`  ✅ 检测到 ${acc.platform} 账号: ${acc.name} (${acc.followers} 粉丝)`);
        }
      }

      // 2) Query Expansion
      const expandedKeywords = await expandKeyword(keyword.text);
      console.log(`  🔍 扩展为 ${expandedKeywords.length} 个变体: ${expandedKeywords.slice(0, 5).join(', ')}${expandedKeywords.length > 5 ? '...' : ''}`);

      // 3) 7 源并发搜索
      const searchResults = await Promise.allSettled([
        searchTwitter(keyword.text),
        searchBing(keyword.text),
        searchHackerNews(keyword.text),
        searchDuckDuckGo(keyword.text),
        searchSogou(keyword.text),
        searchBilibili(keyword.text),
        searchWeibo(keyword.text)
      ]);

      const sourceNames = ['Twitter', 'Bing', 'HackerNews', 'DuckDuckGo', '搜狗', 'B站', '微博'];
      const allResults: SearchResult[] = [...accountResult.results]; // 账号检测到的内容优先

      searchResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
          console.log(`  ${sourceNames[i]}: ${result.value.length} 条`);
        } else {
          console.warn(`  ${sourceNames[i]}: 失败 - ${result.reason}`);
        }
      });

      // 4) 去重 → 新鲜度 → 优先级排序
      const unique = deduplicateResults(allResults);
      const fresh = filterByFreshness(unique);
      const sorted = prioritizeResults(fresh);
      console.log(`  📊 ${allResults.length} 原始 → ${unique.length} 去重 → ${fresh.length} 新鲜 → ${sorted.length} 待处理`);

      // 5) 逐条处理
      const ctx: ProcessContext = {
        keywordId: keyword.id,
        keywordText: keyword.text,
        expandedKeywords,
        io,
        twitterCount: 0,
        otherCount: 0
      };

      let saved = 0, duplicates = 0, filtered = 0, errors = 0;

      for (const item of sorted) {
        // 配额检查提前跳出
        if (ctx.twitterCount + ctx.otherCount >= TOTAL_QUOTA) break;

        const result = await processResult(item, ctx);
        switch (result) {
          case 'saved': saved++; break;
          case 'duplicate': duplicates++; break;
          case 'filtered': filtered++; break;
          case 'error': errors++; break;
        }
      }

      totalNew += saved;
      console.log(`  📈 结果: ${saved} 新增 | ${duplicates} 重复 | ${filtered} 过滤 | ${errors} 错误`);

      // 关键词间隔
      await new Promise(r => setTimeout(r, KEYWORD_INTERVAL_MS));

    } catch (error) {
      console.error(`  ❌ 关键词 "${keyword.text}" 检查失败:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n✨ ===== 热点检查完成: 共 ${totalNew} 条新增 =====`);
}
