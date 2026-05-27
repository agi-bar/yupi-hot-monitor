import { describe, it, expect } from 'vitest';
import { parseRelativeDate, parseSearchEngineDate, parseWeixinDate } from '../utils/dateParser.js';

describe('parseRelativeDate', () => {
  it('解析"X分钟前"格式', () => {
    const result = parseRelativeDate('30分钟前');
    expect(result).toBeInstanceOf(Date);
    expect(result).toBeDefined();
  });

  it('解析"X小时前"格式', () => {
    const result = parseRelativeDate('2小时前');
    expect(result).toBeInstanceOf(Date);
    expect(result).toBeDefined();
  });

  it('解析"X天前"格式', () => {
    const result = parseRelativeDate('3天前');
    expect(result).toBeInstanceOf(Date);
    expect(result).toBeDefined();
  });

  it('解析"昨天"', () => {
    const result = parseRelativeDate('昨天');
    expect(result).toBeInstanceOf(Date);
    expect(result).toBeDefined();
  });

  it('解析"刚刚"', () => {
    const result = parseRelativeDate('刚刚');
    expect(result).toBeInstanceOf(Date);
    expect(result).toBeDefined();
  });

  it('返回 null 对于无效输入', () => {
    expect(parseRelativeDate('')).toBeNull();
    expect(parseRelativeDate('invalid')).toBeNull();
  });
});

describe('parseSearchEngineDate', () => {
  it('解析相对时间格式', () => {
    const result = parseSearchEngineDate('2小时前');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析中文"X月X日"格式', () => {
    const result = parseSearchEngineDate('5月27日');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析英文月份格式', () => {
    const result = parseSearchEngineDate('May 27');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析标准日期格式', () => {
    const result = parseSearchEngineDate('2024-05-27');
    expect(result).toBeInstanceOf(Date);
  });

  it('返回 null 对于无效输入', () => {
    expect(parseSearchEngineDate('')).toBeNull();
  });
});

describe('parseWeixinDate', () => {
  it('解析"今天 HH:MM"格式', () => {
    const result = parseWeixinDate('今天 15:30');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析"昨天 HH:MM"格式', () => {
    const result = parseWeixinDate('昨天 12:00');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析"X天前"格式', () => {
    const result = parseWeixinDate('5天前');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析"X小时前"格式', () => {
    const result = parseWeixinDate('2小时前');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析"X月X日"格式', () => {
    const result = parseWeixinDate('5月27日');
    expect(result).toBeInstanceOf(Date);
  });

  it('解析"YYYY年MM月DD日"格式', () => {
    const result = parseWeixinDate('2024年5月27日');
    expect(result).toBeInstanceOf(Date);
  });

  it('返回 null 对于无效输入', () => {
    expect(parseWeixinDate('')).toBeNull();
    expect(parseWeixinDate('invalid')).toBeNull();
  });
});
