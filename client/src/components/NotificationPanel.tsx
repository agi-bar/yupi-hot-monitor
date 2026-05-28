import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check, Trash2, Loader2, Clock, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { relativeTime } from '../utils/relativeTime';
import type { Notification } from '../types/notification';

export type NotificationFilterType = 'all' | 'unread' | 'read';

interface NotificationPanelProps {
  notifications: Notification[];
  unreadCount: number;
  isLoading?: boolean;
  error?: string | null;
  onMarkAsRead: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
  onMarkAllRead: () => Promise<void>;
  onClearAll: () => void;
  onNavigate: (hotspotId: string) => Promise<void>;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  navigatingHotspotId?: string | null;
  onClose?: () => void;
}

export default function NotificationPanel({
  notifications,
  unreadCount,
  isLoading = false,
  error = null,
  onMarkAsRead,
  onDelete,
  onMarkAllRead,
  onClearAll,
  onNavigate,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  navigatingHotspotId,
  onClose
}: NotificationPanelProps) {
  const [activeFilter, setActiveFilter] = useState<NotificationFilterType>('all');

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') return notifications.filter(n => !n.isRead);
    if (activeFilter === 'read') return notifications.filter(n => n.isRead);
    return notifications;
  }, [notifications, activeFilter]);

  const filterCounts = useMemo(() => {
    const unread = notifications.filter(n => !n.isRead).length;
    return {
      all: notifications.length,
      unread,
      read: notifications.length - unread
    };
  }, [notifications]);

  const handleFilterChange = (filter: NotificationFilterType) => {
    setActiveFilter(filter);
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification?.id) {
      console.warn('Invalid notification:', notification);
      return;
    }
    
    try {
      if (notification.hotspotId) {
        if (!notification.isRead) {
          await onMarkAsRead(notification.id);
        }
        await onNavigate(notification.hotspotId);
        onClose?.();
      }
    } catch (error) {
      console.error('Failed to handle notification click:', error);
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!id) {
      console.warn('Invalid notification ID');
      return;
    }
    onMarkAsRead(id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!id) {
      console.warn('Invalid notification ID');
      return;
    }
    onDelete(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className="absolute right-0 top-14 w-[420px] bg-gradient-to-b from-[#0a0a1a] to-[#0f0f23]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden notification-panel"
    >
      {/* Header */}
      <div className="border-b border-white/5 notification-panel-border">
        {/* Header Top */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-blue-400" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white shadow-lg animate-pulse notification-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-white text-base notification-text-title">通知中心</h3>
                <p className="text-xs text-slate-500 mt-0.5 notification-text-content">
                  {unreadCount > 0 ? `您有 ${unreadCount} 条未读消息` : '暂无新通知'}
                </p>
              </div>
            </div>
            
            {notifications.length > 0 && (
              <div className="flex items-center gap-1.5">
                {filterCounts.unread > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onMarkAllRead}
                    className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    全部已读
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClearAll}
                  className="px-3 py-1.5 text-xs font-medium text-red-400/70 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-all flex items-center gap-1.5"
                  title="清空所有通知"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空
                </motion.button>
              </div>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        {notifications.length > 0 && (
          <div className="px-5 pb-4">
            <div className="flex gap-2 p-1.5 bg-white/[0.02] rounded-xl border border-white/5 notification-filter-bg">
              {([
                { key: 'all', label: '全部', count: filterCounts.all, icon: '📋' },
                { key: 'unread', label: '未读', count: filterCounts.unread, icon: '🔔' },
                { key: 'read', label: '已读', count: filterCounts.read, icon: '✓' }
              ] as const).map(({ key, label, count }) => (
                <motion.button
                  key={key}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleFilterChange(key)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2",
                    activeFilter === key
                      ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold",
                      activeFilter === key
                        ? "bg-white/20"
                        : "bg-blue-500/20 text-blue-500"
                    )}>
                      {count}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent notification-scroll">
        {/* Loading State */}
        {isLoading && notifications.length === 0 && (
          <div className="py-16 px-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center animate-pulse">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            </div>
            <h4 className="text-white font-medium mb-2">加载中...</h4>
            <p className="text-slate-500 text-sm">正在获取通知</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="py-16 px-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <Bell className="w-10 h-10 text-red-400" />
            </div>
            <h4 className="text-white font-medium mb-2">加载失败</h4>
            <p className="text-slate-500 text-sm mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredNotifications.length === 0 ? (
          <div className="py-16 px-8 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 flex items-center justify-center notification-empty-icon">
                <Bell className="w-10 h-10 text-slate-600" />
              </div>
              <h4 className="text-white font-medium mb-2 notification-text-title">暂无通知</h4>
              <p className="text-slate-500 text-sm leading-relaxed notification-text-content">
                {activeFilter === 'all' && '还没有收到任何通知消息'}
                {activeFilter === 'unread' && '所有通知都已读'}
                {activeFilter === 'read' && '还没有已读的通知'}
              </p>
            </div>
        ) : (
          <div className="divide-y divide-white/[0.03] notification-divider">
            {filteredNotifications.map((n, index) => {
              if (!n || !n.id) {
                console.warn('Invalid notification item:', n);
                return null;
              }
              
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "p-5 transition-all cursor-pointer group relative",
                    n.isRead ? 'notification-item' : 'notification-item-unread',
                    "hover:bg-white/[0.02]",
                    navigatingHotspotId === n.hotspotId && 'ring-2 ring-blue-500/50'
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* Loading Overlay */}
                  {navigatingHotspotId === n.hotspotId && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 notification-loading-bg">
                      <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-full">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        <span className="text-blue-400 text-sm font-medium">正在定位...</span>
                      </div>
                    </motion.div>
                  )}
                  
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center",
                      n.isRead 
                        ? 'bg-slate-800/50 notification-icon-read' 
                        : 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 notification-icon-bg'
                    )}>
                      <Bell className={cn(
                        "w-5 h-5",
                        n.isRead ? 'text-slate-600' : 'text-blue-400'
                      )} />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* Unread Indicator */}
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex-shrink-0 animate-pulse notification-unread-dot" />
                          )}
                          <h4 className={cn(
                            "font-medium leading-snug line-clamp-1 notification-text-title",
                            n.isRead && 'text-slate-400'
                          )}>
                            {n.title || '无标题'}
                          </h4>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {!n.isRead && (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => handleMarkAsRead(e, n.id)}
                              className="p-1.5 text-slate-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                              title="标记已读"
                            >
                              <Check className="w-4 h-4" />
                            </motion.button>
                          )}
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => handleDelete(e, n.id)}
                            className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="删除通知"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </div>
                      
                      {/* Description */}
                      <p className="text-sm text-slate-500 line-clamp-2 mb-2 notification-text-content">
                        {n.content || '暂无内容描述'}
                      </p>
                      
                      {/* Meta Info */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 notification-text-time">
                          <Clock className="w-3 h-3" />
                          <span>{n.createdAt ? relativeTime(n.createdAt) : '未知时间'}</span>
                        </div>
                        
                        {n.hotspotId && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-400/70">
                            <ExternalLink className="w-3 h-3" />
                            <span>点击查看详情</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Hover Effect */}
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none notification-hover-effect" />
                </motion.div>
              );
            })}
            
            {/* Load More */}
            {hasMore && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="w-full py-4 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>加载更多通知...</span>
                  </>
                ) : (
                  <>
                    <span>加载更多</span>
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
