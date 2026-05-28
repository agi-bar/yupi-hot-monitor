import { useState, useCallback, useRef, useEffect } from 'react';
import type { Notification } from '../types/notification';

interface UseNotificationsOptions {
  debounceMs?: number;
  maxNotifications?: number;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { debounceMs = 100, maxNotifications = 50 } = options;
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const pendingNotifications = useRef<Notification[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsRef = useRef<Notification[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const flushPendingNotifications = useCallback(() => {
    if (pendingNotifications.current.length === 0) return;
    
    const pending = pendingNotifications.current;
    pendingNotifications.current = [];
    
    setNotifications(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const uniquePending = pending.filter(n => !existingIds.has(n.id));
      
      if (uniquePending.length === 0) {
        return prev;
      }
      
      setUnreadCount(c => c + uniquePending.length);
      const merged = [...uniquePending, ...prev];
      return merged.slice(0, maxNotifications);
    });
  }, [maxNotifications]);

  const addNotification = useCallback((notification: Notification) => {
    const exists = notificationsRef.current.some(n => 
      (notification.hotspotId && n.hotspotId === notification.hotspotId) || 
      n.id === notification.id
    );
    
    if (exists) return;

    pendingNotifications.current.push(notification);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      flushPendingNotifications();
    }, debounceMs);
  }, [debounceMs, flushPendingNotifications]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  const deleteNotification = useCallback((id: string) => {
    const notification = notifications.find(n => n.id === id);
    
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    if (notification && !notification.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [notifications]);

  const clearAll = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    pendingNotifications.current = [];
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const updateNotifications = useCallback((newNotifications: Notification[]) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      flushPendingNotifications();
    }
    
    setNotifications(newNotifications.slice(0, maxNotifications));
    setUnreadCount(newNotifications.filter(n => !n.isRead).length);
  }, [maxNotifications, flushPendingNotifications]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        flushPendingNotifications();
      }
    };
  }, [flushPendingNotifications]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    updateNotifications
  };
}
