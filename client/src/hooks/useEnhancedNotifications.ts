import { useState, useCallback, useRef, useEffect } from 'react';
import { notificationsApi } from '../services/api';
import type { Notification } from '../types/notification';
import { toNotification } from '../utils/notificationConverter';

interface NotificationCache {
  pages: Map<number, Notification[]>;
  totalPages: number;
  lastUpdated: Date;
}

interface UseEnhancedNotificationsOptions {
  pageSize?: number;
  cacheTimeout?: number;
}

interface UseEnhancedNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  loadNotifications: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  refreshCache: () => void;
}

export function useEnhancedNotifications(
  options: UseEnhancedNotificationsOptions = {}
): UseEnhancedNotificationsReturn {
  const { pageSize = 20, cacheTimeout = 5 * 60 * 1000 } = options;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<NotificationCache>({
    pages: new Map(),
    totalPages: 1,
    lastUpdated: new Date()
  });
  const pendingNotifications = useRef<Notification[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await notificationsApi.getAll({
        page: 1,
        limit: pageSize
      });

      const notificationData = (data.data as unknown[]).map(toNotification);
      setNotifications(notificationData);
      setUnreadCount(data.unreadCount);
      setCurrentPage(1);
      setTotalPages(data.pagination.totalPages);

      cacheRef.current = {
        pages: new Map([[1, notificationData]]),
        totalPages: data.pagination.totalPages,
        lastUpdated: new Date()
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载通知失败';
      setError(errorMessage);
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (isLoading || currentPage >= totalPages) return;

    setIsLoading(true);
    setError(null);

    try {
      const nextPage = currentPage + 1;

      if (cacheRef.current.pages.has(nextPage)) {
        const cachedNotifications = cacheRef.current.pages.get(nextPage)!;
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotifications = cachedNotifications.filter(n => !existingIds.has(n.id));
          return [...prev, ...newNotifications];
        });
        setCurrentPage(nextPage);
      } else {
        const data = await notificationsApi.getAll({
          page: nextPage,
          limit: pageSize
        });

        const notificationData = (data.data as unknown[]).map(toNotification);
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotifications = notificationData.filter(n => !existingIds.has(n.id));
          return [...prev, ...newNotifications];
        });

        cacheRef.current.pages.set(nextPage, notificationData);
        cacheRef.current.lastUpdated = new Date();
        setCurrentPage(nextPage);
      }

      setTotalPages(cacheRef.current.totalPages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载更多通知失败';
      setError(errorMessage);
      console.error('Failed to load more notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, totalPages, isLoading, pageSize]);

  const markAsRead = useCallback(async (id: string) => {
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await notificationsApi.markAsRead(id);
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      console.error('Failed to mark notification as read:', err);
    }
  }, [notifications, unreadCount]);

  const markAllAsRead = useCallback(async () => {
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await notificationsApi.markAllAsRead();
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      console.error('Failed to mark all as read:', err);
    }
  }, [notifications, unreadCount]);

  const deleteNotification = useCallback(async (id: string) => {
    const previousNotifications = notifications;
    const notification = notifications.find(n => n.id === id);
    const previousUnreadCount = unreadCount;

    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notification && !notification.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    try {
      await notificationsApi.delete(id);
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      console.error('Failed to delete notification:', err);
    }
  }, [notifications, unreadCount]);

  const clearAll = useCallback(async () => {
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setNotifications([]);
    setUnreadCount(0);
    cacheRef.current = {
      pages: new Map(),
      totalPages: 1,
      lastUpdated: new Date()
    };

    try {
      await notificationsApi.clear();
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      console.error('Failed to clear notifications:', err);
    }
  }, [notifications, unreadCount]);

  const addNotification = useCallback((notification: Notification) => {
    const exists = notifications.some(n =>
      (notification.hotspotId && n.hotspotId === notification.hotspotId) ||
      n.id === notification.id
    );

    if (exists) return;

    pendingNotifications.current.push(notification);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const pending = pendingNotifications.current;
      pendingNotifications.current = [];

      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const uniquePending = pending.filter(n => !existingIds.has(n.id));

        if (uniquePending.length === 0) return prev;

        setUnreadCount(c => c + uniquePending.length);
        return [...uniquePending, ...prev];
      });
    }, 100);
  }, [notifications]);

  const refreshCache = useCallback(() => {
    const now = new Date();
    if (now.getTime() - cacheRef.current.lastUpdated.getTime() > cacheTimeout) {
      cacheRef.current = {
        pages: new Map(),
        totalPages: 1,
        lastUpdated: new Date()
      };
      loadNotifications();
    }
  }, [cacheTimeout, loadNotifications]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    hasMore: currentPage < totalPages,
    error,
    loadNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    addNotification,
    refreshCache
  };
}
