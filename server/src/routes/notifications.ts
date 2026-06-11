/**
 * 通知路由 - 使用 asyncHandler 统一错误处理
 */
import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { parsePagination, isValidUuid } from '../utils/validators.js';

const idOf = (req: { params: Record<string, string | string[] | undefined> }): string => {
  const v = req.params.id;
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
};

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query as any);
  const unreadOnly = req.query.unreadOnly === 'true';

  const where: any = {};
  if (unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: limit
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { isRead: false } })
  ]);

  res.json({
    data: notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  const notification = await prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });
  res.json(notification);
}));

router.patch('/read-all', asyncHandler(async (_req, res) => {
  await prisma.notification.updateMany({
    where: { isRead: false },
    data: { isRead: true }
  });
  res.json({ message: 'All notifications marked as read' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = idOf(req);
  if (!isValidUuid(id)) throw new HttpError(400, 'Invalid id format');
  await prisma.notification.delete({ where: { id } });
  res.status(204).send();
}));

router.delete('/', asyncHandler(async (_req, res) => {
  await prisma.notification.deleteMany({});
  res.json({ message: 'All notifications deleted' });
}));

export default router;
