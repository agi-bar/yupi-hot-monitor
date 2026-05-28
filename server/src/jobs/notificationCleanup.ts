import { prisma } from '../db.js';
import { NOTIFICATION_CONFIG, TIME_CONSTANTS } from '../constants/notification.js';

export interface CleanupResult {
  deletedCount: number;
  deletedAt: Date;
  expiredBefore: Date;
}

export const notificationCleanupJob = {
  async cleanupExpired(): Promise<CleanupResult> {
    const expiredBefore = new Date();
    expiredBefore.setDate(expiredBefore.getDate() - NOTIFICATION_CONFIG.EXPIRE_DAYS);
    
    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: expiredBefore
        }
      }
    });
    
    const cleanupResult: CleanupResult = {
      deletedCount: result.count,
      deletedAt: new Date(),
      expiredBefore
    };
    
    if (result.count > 0) {
      console.log(`🗑️  Cleaned up ${result.count} expired notifications (older than ${NOTIFICATION_CONFIG.EXPIRE_DAYS} days)`);
    }
    
    return cleanupResult;
  },

  async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - NOTIFICATION_CONFIG.EXPIRE_DAYS * TIME_CONSTANTS.MS_PER_DAY
    );
    
    const [total, expired, recent] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({
        where: { createdAt: { lt: thirtyDaysAgo } }
      }),
      prisma.notification.count({
        where: { createdAt: { gte: thirtyDaysAgo } }
      })
    ]);
    
    return {
      total,
      expired,
      recent,
      expireDays: NOTIFICATION_CONFIG.EXPIRE_DAYS
    };
  }
};
