const PLACEHOLDER_PATTERNS = [
  /xxx/i,
  /example/i,
  /localhost/i,
  /#$/,
  /\/question\/\d+\/answer\/[A-Za-z]+$/,
  /\/answer\/[A-Za-z]+$/
];

const DATE_PATTERNS = [
  /(\d{4})[\-/年](\d{1,2})[\-/月](\d{1,2})[日号]?/g,
  /(\d{4})[\-/年](\d{1,2})[\-/月]/g,
  /(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})/g,
  /(\d{1,2})[\-/月](\d{1,2})[日号]?[\-/](\d{4})/g,
  /(\d{1,2})[\-/](\d{1,2})[\-/](\d{4})/g,
  /(\d{4})年(\d{1,2})月/g
];

export function extractDatesFromContent(content: string): Date[] {
  const uniqueDates = new Set<number>(); // 使用Set存储时间戳避免重复
  
  for (const pattern of DATE_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      let year: number, month: number, day: number = 1;
      
      if (match[3] && match[3].length === 4) {
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      } else {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        if (match[3]) day = parseInt(match[3]);
      }
      
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          uniqueDates.add(date.getTime());
        }
      }
    }
  }
  
  // 转换为Date数组并排序
  return Array.from(uniqueDates)
    .map(timestamp => new Date(timestamp))
    .sort((a, b) => b.getTime() - a.getTime());
}

export function isContentTooOld(content: string, maxAgeDays: number = 180): {
  tooOld: boolean;
  reason?: string;
  detectedDate?: Date;
} {
  const dates = extractDatesFromContent(content);
  
  if (dates.length === 0) {
    return { tooOld: false };
  }
  
  const latestDate = dates[0];
  const now = new Date();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  
  if (now.getTime() - latestDate.getTime() > maxAgeMs) {
    return {
      tooOld: true,
      reason: `内容发布时间过旧（检测到日期: ${latestDate.toLocaleDateString('zh-CN')}，超过${maxAgeDays}天）`,
      detectedDate: latestDate
    };
  }
  
  return { tooOld: false };
}

const DOMAIN_WHITELIST = [
  /^https?:\/\/[^.]+\.weibo\.com/,
  /^https?:\/\/[^.]+\.bilibili\.com/,
  /^https?:\/\/[^.]+\.zhihu\.com/,
  /^https?:\/\/[^.]+\.weixin\.qq\.com/,
  /^https?:\/\/[^.]+\.baidu\.com/,
  /^https?:\/\/[^.]+\.sogou\.com/,
  /^https?:\/\/twitter\.com/,
  /^https?:\/\/x\.com/,
  /^https?:\/\/news\.ycombinator\.com/,
  /^https?:\/\/www\.bing\.com/,
  /^https?:\/\/www\.google\.com/,
  /^https?:\/\/duckduckgo\.com/
];

const WEIBO_URL_REGEX = /^https?:\/\/(?:www\.)?weibo\.com\/\d+\/\w{9,12}$/;
const BILIBILI_URL_REGEX = /^https?:\/\/(?:www\.)?bilibili\.com\/video\/BV[A-Za-z0-9]{10,12}$/;
const ZHIHU_ANSWER_REGEX = /^https?:\/\/(?:www\.)?zhihu\.com\/question\/\d+\/answer\/\d+$/;
const ZHIHU_ARTICLE_REGEX = /^https?:\/\/(?:www\.)?zhihu\.com\/article\/[a-zA-Z0-9]{10,}$/;
const WECHAT_URL_REGEX = /^https?:\/\/mp\.weixin\.qq\.com\/s(?:\/[a-zA-Z0-9_-]{10,}|[?#])/;

export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }
    
    if (!parsedUrl.hostname || parsedUrl.hostname.length < 4) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

export function containsPlaceholder(url: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(url));
}

export function isDomainAllowed(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    return DOMAIN_WHITELIST.some(pattern => pattern.test(url)) ||
           hostname.includes('.weibo.com') ||
           hostname.includes('.bilibili.com') ||
           hostname.includes('.zhihu.com') ||
           hostname.includes('.weixin.qq.com') ||
           hostname.includes('.twitter.com') ||
           hostname.includes('.x.com');
  } catch {
    return false;
  }
}

export function validatePlatformUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    if (hostname.includes('weibo.com')) {
      return WEIBO_URL_REGEX.test(url);
    }
    
    if (hostname.includes('bilibili.com')) {
      return BILIBILI_URL_REGEX.test(url);
    }
    
    if (hostname.includes('zhihu.com')) {
      return ZHIHU_ANSWER_REGEX.test(url) || ZHIHU_ARTICLE_REGEX.test(url);
    }
    
    if (hostname.includes('weixin.qq.com')) {
      return WECHAT_URL_REGEX.test(url);
    }
    
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      return pathParts.length >= 2 && pathParts[0].length > 0;
    }
    
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    
    parsedUrl.protocol = 'https:';
    
    if (parsedUrl.hostname.startsWith('www.')) {
      parsedUrl.hostname = parsedUrl.hostname.substring(4);
    }
    
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

export function isWeChatUrlExpired(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    if (!parsedUrl.hostname.includes('weixin.qq.com')) {
      return false;
    }
    
    const timestamp = parsedUrl.searchParams.get('timestamp');
    if (!timestamp) {
      return false;
    }
    
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    return now - timestampMs > oneDay;
  } catch {
    return false;
  }
}

export function isUrlTimestampTooOld(url: string, maxAgeDays: number = 365): boolean {
  try {
    const parsedUrl = new URL(url);
    const timestamp = parsedUrl.searchParams.get('timestamp');
    
    if (!timestamp) {
      return false;
    }
    
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    
    return now - timestampMs > maxAgeMs;
  } catch {
    return false;
  }
}

export function checkUrlQuality(url: string, maxContentAgeDays: number = 180): {
  valid: boolean;
  reason?: string;
} {
  if (!isValidUrl(url)) {
    return { valid: false, reason: '无效的URL格式' };
  }
  
  if (containsPlaceholder(url)) {
    return { valid: false, reason: 'URL包含占位符' };
  }
  
  if (!isDomainAllowed(url)) {
    return { valid: false, reason: '不在允许的域名白名单中' };
  }
  
  if (!validatePlatformUrl(url)) {
    return { valid: false, reason: 'URL不符合平台格式规范' };
  }
  
  if (isWeChatUrlExpired(url)) {
    return { valid: false, reason: '微信公众号链接已过期' };
  }
  
  if (isUrlTimestampTooOld(url, maxContentAgeDays)) {
    return { valid: false, reason: `内容发布时间过旧（超过${maxContentAgeDays}天）` };
  }
  
  return { valid: true };
}