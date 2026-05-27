import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { relativeTime } from '../utils/relativeTime';

export type NotificationType = 'all' | 'unread' | 'read';

interface Notification {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  hotspotId?: string;
  type?: 'hotspot' | 'keyword' | 'system';
}

interface NotificationPanelProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onNavigate: (hotspotId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export default function NotificationPanel({
  notifications,
  unreadCount,
  onMarkAsRead,
  onDelete,
  onMarkAllRead,
  onClearAll,
  onNavigate,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false
}: NotificationPanelProps) {
  const [activeFilter, setActiveFilter] = useState<NotificationType>('all');

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'unread') return !n.isRead;
    if (activeFilter === 'read') return n.isRead;
    return true;
  });

  const filterCounts = {
    all: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    read: notifications.filter(n => n.isRead).length
  };

  const handleFilterChange = (filter: NotificationType) => {
    setActiveFilter(filter);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.hotspotId && !notification.isRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.hotspotId) {
      onNavigate(notification.hotspotId);
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onMarkAsRead(id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className="absolute right-0 top-14 w-96 bg-[#0a0a1a]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-white/5">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">通知</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">
                {unreadCount}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="flex items-center gap-2">
              {filterCounts.unread > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  全部已读
                </button>
              )}
              <button
                onClick={onClearAll}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                title="清空所有"
              >
                清空
              </button>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        {notifications.length > 0 && (
          <div className="px-4 pb-3">
            <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
              {([
                { key: 'all', label: '全部', count: filterCounts.all },
                { key: 'unread', label: '未读', count: filterCounts.unread },
                { key: 'read', label: '已读', count: filterCounts.read }
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => handleFilterChange(key)}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                    activeFilter === key
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  )}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px]",
                      activeFilter === key
                        ? "bg-white/20"
                        : "bg-white/10"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {activeFilter === 'all' && '暂无通知'}
              {activeFilter === 'unread' && '没有未读通知'}
              {activeFilter === 'read' && '没有已读通知'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredNotifications.map(n => (
              <div
                key={n.id}
                className={cn(
                  "p-4 transition-colors cursor-pointer group",
                  n.isRead ? 'opacity-60 hover:opacity-80' : 'bg-blue-500/5 hover:bg-blue-500/10'
                )}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      )}
                      <p className={cn(
                        "text-sm font-medium leading-snug",
                        n.isRead ? 'text-slate-300' : 'text-white'
                      )}>
                        {n.title}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.content}</p>
                    <p className="text-xs text-slate-600 mt-2">
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.isRead && (
                      <button
                        onClick={(e) => handleMarkAsRead(e, n.id)}
                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="标记已读"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, n.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="w-full py-3 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>加载中...</span>
                  </>
                ) : (
                  <span>加载更多</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
