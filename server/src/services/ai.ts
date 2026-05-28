import axios from 'axios';
import type { AIAnalysis } from '../types.js';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const MINIMAX_MODEL = 'MiniMax-M2.7';

function getMinimaxHeaders() {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY or OPENROUTER_API_KEY is required');
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

function fixJSONQuotes(str: string): string {
  return str.replace(/'/g, '"');
}

function parseJSONFlexible(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  
  let jsonStr = jsonMatch[0];
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(fixJSONQuotes(jsonStr));
    } catch {
      const objectStart = jsonStr.indexOf('{');
      const objectEnd = jsonStr.lastIndexOf('}');
      if (objectStart !== -1 && objectEnd !== -1) {
        const cleanJson = fixJSONQuotes(jsonStr.substring(objectStart, objectEnd + 1));
        return JSON.parse(cleanJson);
      }
      throw new Error('Failed to parse JSON');
    }
  }
}

async function callMinimax(messages: Array<{role: string; content: string}>, temperature = 0.2, maxTokens = 500): Promise<string> {
  try {
    const response = await axios.post(MINIMAX_API_URL, {
      model: MINIMAX_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens
    }, {
      headers: getMinimaxHeaders(),
      timeout: 60000
    });

    if (response.data?.choices?.[0]?.message?.content) {
      return response.data.choices[0].message.content;
    }

    throw new Error(`Invalid response from MiniMax API: ${JSON.stringify(response.data)}`);
  } catch (error: any) {
    console.error('MiniMax API Error:', error.response?.data || error.message);
    throw error;
  }
}

const expansionCache = new Map<string, string[]>();

export async function expandKeyword(keyword: string): Promise<string[]> {
  if (expansionCache.has(keyword)) {
    return expansionCache.get(keyword)!;
  }

  const coreTerms = extractCoreTerms(keyword);

  const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const result = [keyword, ...coreTerms];
    expansionCache.set(keyword, result);
    return result;
  }

  try {
    const content = await callMinimax([
      {
        role: 'system',
        content: `你是一个搜索查询扩展专家。给定一个监控关键词，生成该关键词的变体和相关检索词，用于文本匹配。

规则：
1. 包含原始关键词的各种写法（大小写、空格、连字符变体）
2. 包含关键词的核心组成词（拆分后的各个有意义的词）
3. 包含常见别称、缩写、中英文对照
4. 不要加入泛化词（比如关键词是"Claude Sonnet 4.6"，不要加"AI模型"这种泛化词）
5. 总数控制在 5-15 个

输出 JSON 数组，只输出 JSON，不要有其他内容。
示例输入："Claude Sonnet 4.6"
示例输出：["Claude Sonnet 4.6", "Claude Sonnet", "Sonnet 4.6", "claude-sonnet-4.6", "Claude 4.6", "Anthropic Sonnet"]`
      },
      {
        role: 'user',
        content: keyword
      }
    ], 0.2, 300);

    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed: string[] = JSON.parse(arrayMatch[0]);
        const expanded = [...new Set([keyword, ...coreTerms, ...parsed.map(s => s.trim()).filter(Boolean)])];
        expansionCache.set(keyword, expanded);
        console.log(`  🔍 Query expansion for "${keyword}": ${expanded.length} variants`);
        return expanded;
      } catch {
        const cleaned = arrayMatch[0].replace(/'/g, '"');
        const parsed: string[] = JSON.parse(cleaned);
        const expanded = [...new Set([keyword, ...coreTerms, ...parsed.map(s => s.trim()).filter(Boolean)])];
        expansionCache.set(keyword, expanded);
        console.log(`  🔍 Query expansion for "${keyword}": ${expanded.length} variants`);
        return expanded;
      }
    }
  } catch (error) {
    console.error('Query expansion failed:', error);
  }

  const fallback = [keyword, ...coreTerms];
  expansionCache.set(keyword, fallback);
  return fallback;
}

function extractCoreTerms(keyword: string): string[] {
  const terms: string[] = [];
  const parts = keyword.split(/[\s\-_\/\\·]+/).filter(p => p.length >= 2);
  if (parts.length > 1) {
    terms.push(...parts);
    for (let i = 0; i < parts.length - 1; i++) {
      terms.push(parts[i] + ' ' + parts[i + 1]);
    }
  }
  return [...new Set(terms)].filter(t => t.toLowerCase() !== keyword.toLowerCase());
}

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

function buildAnalysisPrompt(keyword: string, preMatchResult: { matched: boolean; matchedTerms: string[] }): string {
  const matchHint = preMatchResult.matched 
    ? `\n注意：文本预匹配发现内容中包含以下关键词变体：${preMatchResult.matchedTerms.join('、')}` 
    : `\n注意：文本预匹配发现内容中未直接提及关键词"${keyword}"的任何变体，请特别严格审核相关性。`;

  return `你是一个热点内容精准匹配专家。你的任务是判断一段内容是否与指定的监控关键词【${keyword}】直接相关。

${matchHint}

分析要点：
1. 判断是否为真实有价值的信息（排除标题党、假新闻、营销软文）
2. 判断内容是否【直接】涉及关键词"${keyword}"。注意：
   - 仅仅属于同一领域但未提及关键词的内容，相关性应低于 40 分
   - 内容必须直接讨论、提及或与"${keyword}"有实质关联才能获得 60 分以上
   - 只是间接沾边（如同类产品、同领域但不同主题）应给 30-50 分
3. 判断内容中是否直接提及了"${keyword}"或其等价表述（keywordMentioned）
4. 评估热点的重要程度（对关注"${keyword}"的人来说有多重要）
5. 用一句话说明此内容与"${keyword}"的关系（不是介绍内容本身，而是说"此内容与关键词的关联是什么"）
6. 用一句话解释你的相关性打分理由

请以 JSON 格式输出：
{
  "isReal": true/false,
  "relevance": 0-100,
  "relevanceReason": "相关性打分理由...",
  "keywordMentioned": true/false,
  "importance": "low/medium/high/urgent",
  "summary": "此内容与【${keyword}】的关联：..."
}

只输出 JSON，不要有其他内容。`;
}

export async function analyzeContent(content: string, keyword: string, preMatchResult?: { matched: boolean; matchedTerms: string[] }): Promise<AIAnalysis> {
  const matchResult = preMatchResult ?? { matched: false, matchedTerms: [] };

  const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('MiniMax API key not configured, using fallback analysis');
    return {
      isReal: true,
      relevance: matchResult.matched ? 50 : 20,
      relevanceReason: '未配置 AI 服务，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: 'low',
      summary: content.slice(0, 50) + '...'
    };
  }

  try {
    const prompt = buildAnalysisPrompt(keyword, matchResult);
    const response = await callMinimax([
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: content.slice(0, 2000)
      }
    ], 0.2, 500);

    const parsed = parseJSONFlexible(response);
    
    return {
      isReal: Boolean(parsed.isReal),
      relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
      relevanceReason: String(parsed.relevanceReason || '').slice(0, 500),
      keywordMentioned: Boolean(parsed.keywordMentioned),
      importance: ['low', 'medium', 'high', 'urgent'].includes(parsed.importance) 
        ? parsed.importance 
        : 'low',
      summary: String(parsed.summary || '').slice(0, 500)
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      isReal: true,
      relevance: matchResult.matched ? 30 : 10,
      relevanceReason: 'AI 分析失败，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: 'low',
      summary: content.slice(0, 200) + '...'
    };
  }
}

export async function batchAnalyze(contents: string[], keyword: string, expandedKeywords?: string[]): Promise<AIAnalysis[]> {
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
