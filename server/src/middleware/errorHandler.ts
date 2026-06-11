/**
 * 统一错误处理中间件
 *
 * 替换每个路由里重复的 try-catch + console.error + res.status(500) 模式
 */

import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 高阶函数：包装 async 路由处理器，自动捕获异常
 * 用法：router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(
  fn: T
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 统一错误响应中间件（必须放在所有路由之后）
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // 已知业务错误
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code && { code: err.code })
    });
  }

  // Prisma 错误
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: '记录已存在' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: '记录不存在' });
  }

  // 未预期错误
  console.error('[Unhandled Error]', err);
  return res.status(500).json({
    error: '服务器内部错误',
    ...(process.env.NODE_ENV !== 'production' && { detail: err?.message })
  });
}
