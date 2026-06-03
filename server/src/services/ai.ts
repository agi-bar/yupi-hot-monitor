import Anthropic from '@anthropic-ai/sdk';
import type { AIAnalysis } from '../types.js';

const anthropic = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.minimaxi.com/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.MINIMAX_API_KEY ?? ''
});

// ========== Query Expansion（查询扩展） ==========

/**
 * 使用 AI 将关键词扩展为多个变体，用于文本预过滤。
 * 返回扩展后的关键词列表（含原始关键词）。
 * 结果会被缓存，同一关键词不会重复调用 AI。
 */
const expansionCache = new Map<string, string[]>();

export async function expandKeyword(keyword: string): Promise<string[]> {
  // 缓存命中
  if (expansionCache.has(keyword)) {
    return expansionCache.get(keyword)!;
  }

  // 不管 AI 是否可用，先提取基础核心词
  const coreTerms = extractCoreTerms(keyword);

  if (!process.env.ANTHROPIC_API_KEY && !process.env.MINIMAX_API_KEY) {
    const result = [keyword, ...coreTerms];
    expansionCache.set(keyword, result);
    return result;
  }

  try {
    const model = process.env.ANTHROPIC_API_KEY ? 'claude-3-haiku-20240307' : 'MiniMax-M2.5';
    const result = await anthropic.messages.create({
      model,
      max_tokens: 300,
      temperature: 0.2,
      system: `你是一个搜索查询扩展专家。给定一个监控关键词，生成该关键词的变体和相关检索词，用于文本匹配。

规则：
1. 包含原始关键词的各种写法（大小写、空格、连字符变体）
2. 包含关键词的核心组成词（拆分后的各个有意义的词）
3. 包含常见别称、缩写、中英文对照
4. 不要加入泛化词（比如关键词是"Claude Sonnet 4.6"，不要加"AI模型"这种泛化词）
5. 总数控制在 5-15 个

输出 JSON 数组，只输出 JSON，不要有其他内容。
示例输入："Claude Sonnet 4.6"
示例输出：["Claude Sonnet 4.6", "Claude Sonnet", "Sonnet 4.6", "claude-sonnet-4.6", "Claude 4.6", "Anthropic Sonnet"]`,
      messages: [
        {
          role: 'user',
          content: keyword
        }
      ]
    });

    const textContent = result.content.find(c => c.type === 'text');
    const responseContent = textContent ? textContent.text : '';
    const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: string[] = JSON.parse(jsonMatch[0]);
      // 确保原始关键词和核心词都在列表中
      const expanded = [...new Set([keyword, ...coreTerms, ...parsed.map(s => s.trim()).filter(Boolean)])];
      expansionCache.set(keyword, expanded);
      console.log(`  🔍 Query expansion for "${keyword}": ${expanded.length} variants`);
      return expanded;
    }
  } catch (error) {
    console.error('Query expansion failed:', error);
  }

  // Fallback：使用基础核心词
  const fallback = [keyword, ...coreTerms];
  expansionCache.set(keyword, fallback);
  return fallback;
}

/**
 * 从关键词中提取核心词（纯文本方式，不依赖 AI）
 */
function extractCoreTerms(keyword: string): string[] {
  const terms: string[] = [];
  // 按空格、连字符、下划线分割
  const parts = keyword.split(/[\s\-_\/\\·]+/).filter(p => p.length >= 2);
  if (parts.length > 1) {
    terms.push(...parts);
    // 两两组合
    for (let i = 0; i < parts.length - 1; i++) {
      terms.push(parts[i] + ' ' + parts[i + 1]);
    }
  }
  // 去重，排除原始关键词本身
  return [...new Set(terms)].filter(t => t.toLowerCase() !== keyword.toLowerCase());
}

// ========== 关键词预匹配 ==========

/**
 * 检查文本中是否包含任一扩展关键词（不区分大小写）。
 * 返回是否匹配以及匹配到的词。
 */
export function preMatchKeyword(text: string, expandedKeywords: string[]): { matched: boolean; matchedTerms: string[] } {
  const lowerText = text.toLowerCase();
  const matchedTerms: string[] = [];
  for (const kw of expandedKeywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      matchedTerms.push(kw);
    }
  }
  return { matched: matchedTerms.length > 0, matchedTerms };
}

// ========== AI 内容分析（关键词感知） ==========

function buildAnalysisPrompt(keyword: string, preMatchResult: { matched: boolean; matchedTerms: string[] }): string {
  const matchHint = preMatchResult.matched 
    ? `\n注意：文本预匹配发现内容中包含以下关键词变体：${preMatchResult.matchedTerms.join('、')}` 
    : `\n注意：文本预匹配发现内容中未直接提及关键词"${keyword}"的任何变体，请结合领域知识判断相关性。`;

  return `你是一个热点内容匹配专家。你的任务是判断一段内容是否与指定的监控关键词【${keyword}】相关。

${matchHint}

分析要点：
1. 判断是否为真实有价值的信息（排除明显标题党、假新闻、营销软文）
2. 判断内容是否与关键词"${keyword}"相关。评分标准：
   - 【80-100分】内容直接讨论、提及关键词或其核心变体
   - 【60-79分】内容涉及关键词的主要方面、竞品对比、相关事件
   - 【40-59分】内容属于同一领域，可能对关注"${keyword}"的用户有价值
   - 【20-39分】内容与关键词有松散关联，如同属一个大领域
   - 【0-19分】内容与关键词无关，纯属泛泛内容
3. 判断内容中是否直接提及了"${keyword}"或其等价表述（keywordMentioned）
4. 评估热点的重要程度：
   - urgent: 重大突发、紧急事件
   - high: 重要进展、重大更新
   - medium: 一般新闻、常规更新
   - low: 小动态、边缘信息
5. 用一句话说明此内容与"${keyword}"的关系
6. 用一句话解释你的相关性打分理由
7. 【重要】尝试从内容中提取发布日期（publishedDate）。搜索结果通常包含日期信息，请注意识别：
   - 明确的日期格式：2024年1月15日、2024-01-15、Jan 15, 2024 等
   - 相对时间描述：昨天、前天、上周、上个月等（需转换为具体日期）
   - 文章内部提到的日期
   - 如果无法确定日期，设置 publishedDate 为 null

请以 JSON 格式输出：
{
  "isReal": true/false,
  "relevance": 0-100,
  "relevanceReason": "相关性打分理由...",
  "keywordMentioned": true/false,
  "importance": "low/medium/high/urgent",
  "summary": "此内容与【${keyword}】的关联：...",
  "publishedDate": "YYYY-MM-DD格式的日期字符串，或null（如果无法确定）",
  "dateConfidence": "high/medium/low（你对日期准确性的置信度）"
}

只输出 JSON，不要有其他内容。`;
}

export async function analyzeContent(content: string, keyword: string, preMatchResult?: { matched: boolean; matchedTerms: string[] }): Promise<AIAnalysis> {
  // 默认预匹配结果
  const matchResult = preMatchResult ?? { matched: false, matchedTerms: [] };

  if (!process.env.ANTHROPIC_API_KEY && !process.env.MINIMAX_API_KEY) {
    console.warn('Minimax API key not configured, using fallback analysis');
    return {
      isReal: true,
      relevance: matchResult.matched ? 55 : 40,
      relevanceReason: '未配置 AI 服务，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: 'medium',
      summary: content.slice(0, 50) + '...'
    };
  }

  try {
    const prompt = buildAnalysisPrompt(keyword, matchResult);
    const model = process.env.ANTHROPIC_API_KEY ? 'claude-3-haiku-20240307' : 'MiniMax-M2.5';

    const result = await anthropic.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.2,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: content.slice(0, 2000) // 限制内容长度
        }
      ]
    });

    // MiniMax API 响应中 content 数组可能包含多个类型：
    // - thinking: MiniMax 特有的思考过程
    // - text: 实际的文本响应
    // 需要找到 text 类型的内容
    const textContent = result.content.find(c => c.type === 'text');
    const responseContent = textContent ? (textContent as any).text : '';
    
    // 尝试解析 JSON
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // 解析日期
      let publishedDate: Date | undefined;
      if (parsed.publishedDate && parsed.publishedDate !== 'null') {
        try {
          const dateStr = String(parsed.publishedDate);
          // 尝试多种日期格式
          const datePatterns = [
            /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /^(\d{4})年(\d{1,2})月(\d{1,2})日/, // YYYY年MM月DD日
          ];
          
          for (const pattern of datePatterns) {
            const match = dateStr.match(pattern);
            if (match) {
              if (pattern.source.startsWith('^\\d{4}-')) {
                publishedDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
              } else {
                publishedDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
              }
              break;
            }
          }
          
          if (!publishedDate || isNaN(publishedDate.getTime())) {
            publishedDate = new Date(dateStr);
          }
        } catch {
          // 日期解析失败
        }
      }
      
      return {
        isReal: Boolean(parsed.isReal),
        relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
        relevanceReason: String(parsed.relevanceReason || '').slice(0, 200),
        keywordMentioned: Boolean(parsed.keywordMentioned),
        importance: ['low', 'medium', 'high', 'urgent'].includes(parsed.importance) 
          ? parsed.importance 
          : 'low',
        summary: String(parsed.summary || '').slice(0, 150),
        publishedDate,
        dateConfidence: ['high', 'medium', 'low'].includes(parsed.dateConfidence)
          ? parsed.dateConfidence
          : undefined
      };
    }

    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI analysis failed:', error);
    if (error instanceof Error) {
      console.error('  Error message:', error.message);
      console.error('  Stack trace:', error.stack);
    }
    return {
      isReal: true,
      relevance: matchResult.matched ? 55 : 40,
      relevanceReason: 'AI 分析失败，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: 'medium',
      summary: content.slice(0, 50) + '...'
    };
  }
}

export async function validateAIConfiguration(): Promise<{ success: boolean; message: string }> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.MINIMAX_API_KEY) {
    return { success: false, message: '未配置 AI API Key (ANTHROPIC_API_KEY 或 MINIMAX_API_KEY)' };
  }
  
  try {
    const model = process.env.ANTHROPIC_API_KEY ? 'claude-3-haiku-20240307' : 'MiniMax-M2.5';
    const result = await anthropic.messages.create({
      model,
      max_tokens: 50, // 需要足够的 token 才能触发 text 类型响应
      messages: [{ role: 'user', content: 'test' }]
    });
    
    const textContent = result.content.find(c => c.type === 'text');
    if (textContent) {
      return { success: true, message: 'AI API 连接验证成功' };
    } else {
      return { success: false, message: 'AI API 响应格式异常，未找到 text 类型内容' };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `AI API 连接失败: ${errorMsg}` };
  }
}

export async function batchAnalyze(contents: string[], keyword: string, expandedKeywords?: string[]): Promise<AIAnalysis[]> {
  // 并行分析，但限制并发数
  const batchSize = 3;
  const results: AIAnalysis[] = [];

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(content => {
        const preMatch = expandedKeywords 
          ? preMatchKeyword(content, expandedKeywords) 
          : undefined;
        return analyzeContent(content, keyword, preMatch);
      })
    );
    results.push(...batchResults);
  }

  return results;
}
