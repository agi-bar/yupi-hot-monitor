import { PrismaClient } from '@prisma/client';

// 全局 Prisma 单例
// 避免 HMR（热重载）或重复导入时创建多个连接
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
