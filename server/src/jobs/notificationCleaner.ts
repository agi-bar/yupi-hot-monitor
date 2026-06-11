/**
 * 通知清理任务
 * 定期删除已读且超过保留期的通知，防止表无限增长
 */
import { prisma } from '../db.js';

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

function resolveRetentionDays(): number {
  const raw = process.env.NOTIFICATION_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
}

export async function cleanupOldNotifications(): Promise<{ deleted: number; retentionDays: number }> {
  const retentionDays = resolveRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: cutoff }
    }
  });

  if (result.count > 0) {
    console.log(`🗑️  Cleaned up ${result.count} old read notifications (>${retentionDays}d)`);
  }

  return { deleted: result.count, retentionDays };
}
