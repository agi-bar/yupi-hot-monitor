import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeUrl,
  validateImportance,
  validateSource,
  validateTimeRange,
  validateBoolString,
  validateSortBy,
  validateSortOrder,
  parsePagination,
  isValidUuid,
  queryString
} from '../utils/validators.js';

describe('validators', () => {
  describe('sanitizeText', () => {
    it('应去除首尾空白', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });

    it('非字符串输入应返回空串', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
      expect(sanitizeText({})).toBe('');
    });

    it('应截断到 maxLength', () => {
      const long = 'a'.repeat(300);
      expect(sanitizeText(long, 100).length).toBe(100);
    });

    it('应移除 <script> 标签', () => {
      const evil = 'hello<script>alert(1)</script>world';
      expect(sanitizeText(evil)).toBe('helloworld');
    });

    it('应移除 onerror 事件处理器', () => {
      const evil = 'click me onerror=alert(1)';
      const result = sanitizeText(evil);
      expect(result).not.toMatch(/onerror/i);
    });

    it('应移除 javascript: 协议', () => {
      const evil = 'click javascript:alert(1)';
      const result = sanitizeText(evil);
      expect(result).not.toMatch(/javascript:/i);
    });
  });

  describe('sanitizeUrl', () => {
    it('合法 https URL 应原样返回', () => {
      expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('合法 http URL 应通过', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('javascript: 协议应被拒', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('ftp 协议应被拒', () => {
      expect(sanitizeUrl('ftp://example.com')).toBeNull();
    });

    it('非字符串应返回 null', () => {
      expect(sanitizeUrl(123)).toBeNull();
      expect(sanitizeUrl(null)).toBeNull();
    });

    it('空字符串应返回 null', () => {
      expect(sanitizeUrl('')).toBeNull();
      expect(sanitizeUrl('   ')).toBeNull();
    });

    it('超长 URL 应被拒', () => {
      const long = 'https://example.com/' + 'a'.repeat(3000);
      expect(sanitizeUrl(long)).toBeNull();
    });
  });

  describe('validateImportance', () => {
    it('应接受 4 个有效值', () => {
      expect(validateImportance('low')).toBe('low');
      expect(validateImportance('medium')).toBe('medium');
      expect(validateImportance('high')).toBe('high');
      expect(validateImportance('urgent')).toBe('urgent');
    });

    it('非法值应返回空串', () => {
      expect(validateImportance('super-urgent')).toBe('');
      expect(validateImportance('')).toBe('');
      expect(validateImportance(123)).toBe('');
    });
  });

  describe('validateSource', () => {
    it('应接受所有 8 个有效源', () => {
      for (const s of ['twitter', 'bing', 'google', 'sogou', 'bilibili', 'weibo', 'hackernews', 'duckduckgo']) {
        expect(validateSource(s)).toBe(s);
      }
    });

    it('非法源应返回空串', () => {
      expect(validateSource('tiktok')).toBe('');
      expect(validateSource('TWITTER')).toBe(''); // 大小写敏感
    });
  });

  describe('validateTimeRange', () => {
    it('应接受 4 个有效区间', () => {
      expect(validateTimeRange('1h')).toBe('1h');
      expect(validateTimeRange('today')).toBe('today');
      expect(validateTimeRange('7d')).toBe('7d');
      expect(validateTimeRange('30d')).toBe('30d');
    });

    it('非法区间应返回空串', () => {
      expect(validateTimeRange('90d')).toBe('');
      expect(validateTimeRange('forever')).toBe('');
    });
  });

  describe('validateBoolString', () => {
    it('字符串 true/false 应原样返回', () => {
      expect(validateBoolString('true')).toBe('true');
      expect(validateBoolString('false')).toBe('false');
    });

    it('布尔 true/false 也应接受', () => {
      expect(validateBoolString(true)).toBe('true');
      expect(validateBoolString(false)).toBe('false');
    });

    it('其他输入应返回空串', () => {
      expect(validateBoolString('1')).toBe('');
      expect(validateBoolString('yes')).toBe('');
      expect(validateBoolString(null)).toBe('');
    });
  });

  describe('validateSortBy / validateSortOrder', () => {
    it('validateSortBy 默认应返回 createdAt', () => {
      expect(validateSortBy(undefined)).toBe('createdAt');
      expect(validateSortBy('unknown')).toBe('createdAt');
    });

    it('validateSortBy 应接受 5 个有效字段', () => {
      for (const s of ['createdAt', 'publishedAt', 'relevance', 'importance', 'hot']) {
        expect(validateSortBy(s)).toBe(s);
      }
    });

    it('validateSortOrder 默认 desc，asc 应原样返回', () => {
      expect(validateSortOrder(undefined)).toBe('desc');
      expect(validateSortOrder('asc')).toBe('asc');
      expect(validateSortOrder('ASC')).toBe('desc');
    });
  });

  describe('parsePagination', () => {
    it('默认值应为 page=1, limit=20', () => {
      const r = parsePagination({});
      expect(r).toEqual({ page: 1, limit: 20, skip: 0 });
    });

    it('应正确计算 skip', () => {
      expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
    });

    it('应限制 limit 上限为 100', () => {
      expect(parsePagination({ limit: '500' }).limit).toBe(100);
    });

    it('应确保 page 至少为 1', () => {
      expect(parsePagination({ page: '-1' }).page).toBe(1);
      expect(parsePagination({ page: '0' }).page).toBe(1);
    });

    it('非法字符串应 fallback 到默认值', () => {
      expect(parsePagination({ page: 'abc' }).page).toBe(1);
      expect(parsePagination({ limit: 'xyz' }).limit).toBe(20);
    });
  });

  describe('isValidUuid', () => {
    it('合法 UUID v4 应通过', () => {
      expect(isValidUuid('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe(true);
    });

    it('非 UUID 格式应被拒', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('123456789')).toBe(false);
      expect(isValidUuid(123)).toBe(false);
    });
  });

  describe('queryString', () => {
    it('字符串应原样返回', () => {
      expect(queryString('hello')).toBe('hello');
    });

    it('字符串数组应取首元素', () => {
      expect(queryString(['hello', 'world'])).toBe('hello');
    });

    it('其他类型应返回空串', () => {
      expect(queryString(undefined)).toBe('');
      expect(queryString(123)).toBe('');
      expect(queryString([])).toBe('');
    });
  });
});
