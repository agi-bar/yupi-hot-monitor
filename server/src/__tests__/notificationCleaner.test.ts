import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanupOldNotifications } from '../jobs/notificationCleaner.js';
import { prisma } from '../db.js';

describe('notificationCleaner', () => {
  const OLD_ENV = process.env.NOTIFICATION_RETENTION_DAYS;

  beforeEach(async () => {
    // 清空测试数据
    await prisma.notification.deleteMany({});
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({});
    if (OLD_ENV === undefined) {
      delete process.env.NOTIFICATION_RETENTION_DAYS;
    } else {
      process.env.NOTIFICATION_RETENTION_DAYS = OLD_ENV;
    }
  });

  it('应删除超过保留期的已读通知', async () => {
    // 创建 35 天前的已读通知
    const old = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        type: 'hotspot',
        title: 'Old read',
        content: 'should be deleted',
        isRead: true,
        createdAt: old
      }
    });
    // 创建 1 天前的已读通知（保留）
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        type: 'hotspot',
        title: 'Recent read',
        content: 'should stay',
        isRead: true,
        createdAt: recent
      }
    });

    const result = await cleanupOldNotifications();

    expect(result.deleted).toBe(1);
    expect(result.retentionDays).toBe(30);

    const remaining = await prisma.notification.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0].title).toBe('Recent read');
  });

  it('不应删除未读通知（即使超过保留期）', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        type: 'hotspot',
        title: 'Old unread',
        content: 'unread stays',
        isRead: false,
        createdAt: old
      }
    });

    const result = await cleanupOldNotifications();

    expect(result.deleted).toBe(0);
    const remaining = await prisma.notification.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0].isRead).toBe(false);
  });

  it('应支持自定义保留期', async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = '7';

    const oldRead = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        type: 'hotspot',
        title: '10 day old',
        content: 'cleanup with 7d retention',
        isRead: true,
        createdAt: oldRead
      }
    });

    const result = await cleanupOldNotifications();

    expect(result.deleted).toBe(1);
    expect(result.retentionDays).toBe(7);
  });

  it('应处理空表（无数据）', async () => {
    const result = await cleanupOldNotifications();
    expect(result.deleted).toBe(0);
    expect(result.retentionDays).toBe(30);
  });

  it('非法 retention 值应使用默认 30', async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = 'invalid';

    const result = await cleanupOldNotifications();
    expect(result.retentionDays).toBe(30);
  });

  it('retention 小于 1 应被截断为 1', async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = '0';

    const result = await cleanupOldNotifications();
    expect(result.retentionDays).toBe(1);
  });

  it('retention 大于 365 应被截断为 365', async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = '999';

    const result = await cleanupOldNotifications();
    expect(result.retentionDays).toBe(365);
  });
});
