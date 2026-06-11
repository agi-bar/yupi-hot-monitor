import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from '../utils/envCheck.js';

describe('envCheck', () => {
  const ENV_VARS_TO_CLEAR = [
    'DATABASE_URL',
    'MINIMAX_API_KEY',
    'MINIMAX_GROUP_ID',
    'TWITTER_API_KEY',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'NOTIFY_EMAIL',
    'CLIENT_URL'
  ];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_VARS_TO_CLEAR) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_VARS_TO_CLEAR) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('DATABASE_URL 缺失应报 error', () => {
    const results = validateEnvironment();
    const dbError = results.find(r => r.key === 'DATABASE_URL');
    expect(dbError).toBeDefined();
    expect(dbError?.level).toBe('error');
  });

  it('MiniMax API 未配置应给出 warning（fallback 提示）', () => {
    process.env.DATABASE_URL = 'file:test.db';
    const results = validateEnvironment();
    const aiWarning = results.find(r => r.key === 'MINIMAX_API');
    expect(aiWarning).toBeDefined();
    expect(aiWarning?.level).toBe('warning');
  });

  it('Twitter API 缺失应给 info（不影响核心功能）', () => {
    process.env.DATABASE_URL = 'file:test.db';
    const results = validateEnvironment();
    const twitterInfo = results.find(r => r.key === 'TWITTER_API_KEY');
    expect(twitterInfo).toBeDefined();
    expect(twitterInfo?.level).toBe('info');
  });

  it('SMTP 部分配置 + 缺 NOTIFY_EMAIL 应给出 info', () => {
    process.env.DATABASE_URL = 'file:test.db';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const results = validateEnvironment();
    const notifyInfo = results.find(r => r.key === 'NOTIFY_EMAIL');
    expect(notifyInfo).toBeDefined();
    expect(notifyInfo?.level).toBe('info');
  });

  it('SMTP 全配置 + NOTIFY_EMAIL 配置应无 SMTP 警告', () => {
    process.env.DATABASE_URL = 'file:test.db';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.NOTIFY_EMAIL = 'admin@example.com';
    const results = validateEnvironment();
    const smtpInfo = results.find(r => r.key === 'SMTP');
    const notifyInfo = results.find(r => r.key === 'NOTIFY_EMAIL');
    expect(smtpInfo).toBeUndefined();
    expect(notifyInfo).toBeUndefined();
  });

  it('CLIENT_URL 未设置应给 info', () => {
    process.env.DATABASE_URL = 'file:test.db';
    const results = validateEnvironment();
    const clientInfo = results.find(r => r.key === 'CLIENT_URL');
    expect(clientInfo).toBeDefined();
    expect(clientInfo?.level).toBe('info');
  });

  it('所有必要项配置后应无 error', () => {
    process.env.DATABASE_URL = 'file:test.db';
    process.env.MINIMAX_API_KEY = 'test-key';
    process.env.MINIMAX_GROUP_ID = 'test-group';
    const results = validateEnvironment();
    const errors = results.filter(r => r.level === 'error');
    expect(errors.length).toBe(0);
  });
});
