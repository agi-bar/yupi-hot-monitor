import { Router } from 'express';
import { prisma } from '../db.js';
import { NOTIFICATION_CONFIG } from '../constants/notification.js';

const router = Router();

// 获取所有通知
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || NOTIFICATION_CONFIG.PAGE_SIZE;
    const unreadOnly = req.query.unreadOnly === 'true';

    const pageNum = Math.max(page, 1);
    const limitNum = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max((pageNum - 1) * limitNum, 0);

    const where = unreadOnly ? { isRead: false } : {};

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { isRead: false } })
    ]);

    res.json({
      data: notifications,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      error: { 
        code: 'FETCH_FAILED', 
        message: 'Failed to fetch notifications' 
      } 
    });
  }
});

// 标记为已读
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ 
        error: { 
          code: 'INVALID_ID', 
          message: 'Invalid notification ID' 
        } 
      });
    }

    const notification = await prisma.notification.update({
      where: { id: id.trim() },
      data: { isRead: true }
    });

    res.json(notification);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: { 
          code: 'NOT_FOUND', 
          message: 'Notification not found' 
        } 
      });
    }
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      error: { 
        code: 'UPDATE_FAILED', 
        message: 'Failed to mark as read' 
      } 
    });
  }
});

// 全部标记为已读
router.patch('/read-all', async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true }
    });

    res.json({ 
      message: 'All notifications marked as read',
      updatedCount: result.count
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ 
      error: { 
        code: 'UPDATE_FAILED', 
        message: 'Failed to mark all as read' 
      } 
    });
  }
});

// 删除通知
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ 
        error: { 
          code: 'INVALID_ID', 
          message: 'Invalid notification ID' 
        } 
      });
    }

    await prisma.notification.delete({
      where: { id: id.trim() }
    });

    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: { 
          code: 'NOT_FOUND', 
          message: 'Notification not found' 
        } 
      });
    }
    console.error('Error deleting notification:', error);
    res.status(500).json({ 
      error: { 
        code: 'DELETE_FAILED', 
        message: 'Failed to delete notification' 
      } 
    });
  }
});

// 清空所有通知
router.delete('/', async (req, res) => {
  try {
    const confirmHeader = req.headers['x-confirm-delete'];
    const bodyConfirm = req.body?.confirm;

    if (confirmHeader !== 'true' && bodyConfirm !== true) {
      return res.status(400).json({ 
        error: { 
          code: 'CONFIRMATION_REQUIRED', 
          message: 'Confirmation required to proceed with deletion' 
        },
        hint: 'Please provide X-Confirm-Delete: true header or confirm: true in request body'
      });
    }

    const result = await prisma.notification.deleteMany({});
    
    res.json({ 
      message: 'All notifications deleted',
      deletedCount: result.count
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ 
      error: { 
        code: 'DELETE_FAILED', 
        message: 'Failed to clear notifications' 
      } 
    });
  }
});

export default router;
