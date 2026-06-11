/**
 * 输入验证工具：防止 XSS/注入，统一参数清洗
 *
 * 后端所有路由在接收外部输入前应通过这些 validator。
 * Express 5 默认不解析 body，需要配合 use(express.json())。
 */

const MAX_TEXT_LENGTH = 200;
const MAX_CATEGORY_LENGTH = 50;
const MAX_URL_LENGTH = 2048;

// 危险模式：HTML 标签、script/onerror/javascript: 等
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /on\w+\s*=\s*["']?[^"'\s>]+/gi,
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi
];

/**
 * 清洗纯文本输入：去首尾空白 + 截断 + 移除危险模式
 */
export function sanitizeText(input: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') return '';
  let text = input.trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    text = text.replace(pattern, '');
  }
  return text;
}

/**
 * 验证 URL：必须是 http/https，URL 格式合法
 */
export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;

  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 验证重要性等级
 */
const VALID_IMPORTANCE = new Set(['low', 'medium', 'high', 'urgent']);
export function validateImportance(input: unknown): 'low' | 'medium' | 'high' | 'urgent' | '' {
  if (typeof input !== 'string') return '';
  return VALID_IMPORTANCE.has(input) ? (input as any) : '';
}

/**
 * 验证源字符串
 */
const VALID_SOURCES = new Set([
  'twitter', 'bing', 'google', 'sogou', 'bilibili', 'weibo', 'hackernews', 'duckduckgo'
]);
export function validateSource(input: unknown): string {
  if (typeof input !== 'string') return '';
  return VALID_SOURCES.has(input) ? input : '';
}

/**
 * 验证时间范围
 */
const VALID_TIME_RANGES = new Set(['1h', 'today', '7d', '30d']);
export function validateTimeRange(input: unknown): string {
  if (typeof input !== 'string') return '';
  return VALID_TIME_RANGES.has(input) ? input : '';
}

/**
 * 验证布尔字符串（用于 isReal 筛选）
 */
export function validateBoolString(input: unknown): 'true' | 'false' | '' {
  if (input === 'true' || input === true) return 'true';
  if (input === 'false' || input === false) return 'false';
  return '';
}

/**
 * 验证排序字段
 */
const VALID_SORT_BY = new Set(['createdAt', 'publishedAt', 'relevance', 'importance', 'hot']);
export function validateSortBy(input: unknown): string {
  if (typeof input !== 'string') return 'createdAt';
  return VALID_SORT_BY.has(input) ? input : 'createdAt';
}

export function validateSortOrder(input: unknown): 'asc' | 'desc' {
  return input === 'asc' ? 'asc' : 'desc';
}

/**
 * 验证分页参数：限制最大 limit 避免一次性拉太多
 */
const MAX_LIMIT = 100;
export function parsePagination(query: Record<string, any>): { page: number; limit: number; skip: number } {
  const pageNum = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  return { page: pageNum, limit: limitNum, skip: (pageNum - 1) * limitNum };
}

/**
 * 验证 UUID
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(input: unknown): boolean {
  return typeof input === 'string' && UUID_PATTERN.test(input);
}

/**
 * Express query 取值（兼容 string|string[]|undefined）
 */
export function queryString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}
