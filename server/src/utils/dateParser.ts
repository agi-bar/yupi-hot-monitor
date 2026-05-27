/**
 * 通用日期解析工具
 * 用于从各种搜索引擎和平台提取和解析日期时间
 */

/**
 * 解析相对时间字符串（如"2小时前"、"昨天"、"3天前"）
 * @param relativeStr 相对时间字符串
 * @returns Date 对象，如果无法解析则返回 null
 */
export function parseRelativeDate(relativeStr: string): Date | null {
  if (!relativeStr) return null;
  
  const now = new Date();
  const lower = relativeStr.toLowerCase();

  // 匹配"X分钟前"、"X小时前"、"X天前"等格式
  const minutesMatch = lower.match(/(\d+)\s*分钟前/);
  if (minutesMatch) {
    return new Date(now.getTime() - parseInt(minutesMatch[1]) * 60 * 1000);
  }

  const hoursMatch = lower.match(/(\d+)\s*小时前/);
  if (hoursMatch) {
    return new Date(now.getTime() - parseInt(hoursMatch[1]) * 60 * 60 * 1000);
  }

  const daysMatch = lower.match(/(\d+)\s*天前/);
  if (daysMatch) {
    return new Date(now.getTime() - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000);
  }

  // 匹配"刚刚"等
  if (lower.includes('刚刚') || lower.includes('just now')) {
    return now;
  }

  // 匹配"昨天"
  if (lower.includes('昨天')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0); // 默认设为中午12点
    return yesterday;
  }

  // 匹配"前"（如"1小时前"已在上面处理，这里处理无数字的情况）
  if (lower.includes('前') && !lower.match(/\d/)) {
    return now; // 无法确定具体时间，返回当前时间
  }

  return null;
}

/**
 * 解析搜索引擎常见的时间格式
 * @param dateStr 日期字符串
 * @returns Date 对象，如果无法解析则返回 null
 */
export function parseSearchEngineDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // 先尝试相对时间
  const relativeDate = parseRelativeDate(trimmed);
  if (relativeDate) return relativeDate;

  // 尝试解析"月/日"格式（如"5月27日"或"May 27"）
  const monthDayMatch = trimmed.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (monthDayMatch) {
    const month = parseInt(monthDayMatch[1]) - 1;
    const day = parseInt(monthDayMatch[2]);
    const date = new Date();
    date.setMonth(month);
    date.setDate(day);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  // 英文月份格式（如"May 27"或"May 27, 2024"）
  const englishMonthMatch = trimmed.match(/([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (englishMonthMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.indexOf(englishMonthMatch[1].toLowerCase());
    if (monthIndex !== -1) {
      const month = monthIndex;
      const day = parseInt(englishMonthMatch[2]);
      const year = englishMonthMatch[3] ? parseInt(englishMonthMatch[3]) : new Date().getFullYear();
      return new Date(year, month, day, 12, 0, 0, 0);
    }
  }

  // 尝试标准日期格式
  const standardDate = new Date(trimmed);
  if (!isNaN(standardDate.getTime())) {
    return standardDate;
  }

  return null;
}

/**
 * 解析微信公众号文章的发布时间
 * 微信公众号常见格式：今天 15:30、昨天 12:00、5月27日、2024年5月27日
 * @param dateStr 日期字符串
 * @returns Date 对象，如果无法解析则返回 null
 */
export function parseWeixinDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  const now = new Date();

  // 匹配"今天 HH:MM"或"今天 HH:MM:SS"
  const todayMatch = trimmed.match(/今天\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (todayMatch) {
    const hour = parseInt(todayMatch[1]);
    const minute = parseInt(todayMatch[2]);
    const second = todayMatch[3] ? parseInt(todayMatch[3]) : 0;
    const date = new Date();
    date.setHours(hour, minute, second, 0);
    return date;
  }

  // 匹配"昨天 HH:MM"
  const yesterdayMatch = trimmed.match(/昨天\s+(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    const hour = parseInt(yesterdayMatch[1]);
    const minute = parseInt(yesterdayMatch[2]);
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  // 匹配"X天前"
  const daysAgoMatch = trimmed.match(/(\d+)\s*天前/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  // 匹配"X小时前"或"X分钟前"
  const relativeDate = parseRelativeDate(trimmed);
  if (relativeDate) return relativeDate;

  // 匹配"X月X日"格式（今年）
  const monthDayMatch = trimmed.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (monthDayMatch) {
    const month = parseInt(monthDayMatch[1]) - 1;
    const day = parseInt(monthDayMatch[2]);
    const date = new Date();
    date.setMonth(month);
    date.setDate(day);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  // 匹配"YYYY年MM月DD日"格式
  const fullDateMatch = trimmed.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (fullDateMatch) {
    const year = parseInt(fullDateMatch[1]);
    const month = parseInt(fullDateMatch[2]) - 1;
    const day = parseInt(fullDateMatch[3]);
    return new Date(year, month, day, 12, 0, 0, 0);
  }

  // 尝试标准日期解析
  const standardDate = new Date(trimmed);
  if (!isNaN(standardDate.getTime())) {
    return standardDate;
  }

  return null;
}
