import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, Search, Plus, Bell, RefreshCw, Sun, Moon,
  Activity, Target, ChevronRight, ChevronsUpDown, ThermometerSun, Eye, Twitter, Globe, Zap, TrendingUp, Clock, AlertTriangle, User,
  Trash2
} from 'lucide-react';
import { 
  keywordsApi, hotspotsApi, notificationsApi, triggerHotspotCheck,
  type Keyword, type Hotspot, type Stats, type Notification
} from './services/api';
import { onNewHotspot, onNotification, subscribeToKeywords, unsubscribeFromKeywords } from './services/socket';
import { cn } from './lib/utils';
import { Spotlight } from './components/ui/spotlight';
import { BackgroundBeams } from './components/ui/background-beams';
import { Meteors } from './components/ui/meteors';
import FilterSortBar, { defaultFilterState, type FilterState } from './components/FilterSortBar';
import Pagination from './components/Pagination';
import HotspotCard from './components/HotspotCard';
import KeywordCard from './components/KeywordCard';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import { sortHotspots } from './utils/sortHotspots';
import { useTheme } from './contexts/ThemeContext';
import { useToast } from './hooks/useToast';

function App() {
  const { toggleTheme, isDark } = useTheme();
  const { toasts, showToast, removeToast, success, error } = useToast();
  
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const [newKeyword, setNewKeyword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keywords' | 'search'>('dashboard');
  
  const [dashboardFilters, setDashboardFilters] = useState<FilterState>({ ...defaultFilterState });
  const [searchFilters, setSearchFilters] = useState<FilterState>({ ...defaultFilterState });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [searchResults, setSearchResults] = useState<Hotspot[]>([]);
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
  const [expandedContents, setExpandedContents] = useState<Set<string>>(new Set());
  const [allReasonsExpanded, setAllReasonsExpanded] = useState(true);
  
  const [selectedHotspots, setSelectedHotspots] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogConfig, setConfirmDialogConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const keywordsRef = useRef<Keyword[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filterParams: Record<string, string | number> = {
        limit: pageSize,
        page: currentPage,
      };
      if (dashboardFilters.source) filterParams.source = dashboardFilters.source;
      if (dashboardFilters.importance) filterParams.importance = dashboardFilters.importance;
      if (dashboardFilters.keywordId) filterParams.keywordId = dashboardFilters.keywordId;
      if (dashboardFilters.timeRange) filterParams.timeRange = dashboardFilters.timeRange;
      if (dashboardFilters.isReal) filterParams.isReal = dashboardFilters.isReal;
      if (dashboardFilters.sortBy) filterParams.sortBy = dashboardFilters.sortBy;
      if (dashboardFilters.sortOrder) filterParams.sortOrder = dashboardFilters.sortOrder;

      const [keywordsData, hotspotsData, statsData, notifData] = await Promise.all([
        keywordsApi.getAll(),
        hotspotsApi.getAll(filterParams),
        hotspotsApi.getStats(),
        notificationsApi.getAll({ limit: 20 })
      ]);
      setKeywords(keywordsData);
      setHotspots(hotspotsData.data);
      setTotalPages(hotspotsData.pagination.totalPages);
      setStats(statsData);
      setNotifications(notifData.data);
      setUnreadCount(notifData.unreadCount);
      
      const hotspotIds = hotspotsData.data.map(h => h.id);
      setExpandedReasons(new Set(hotspotIds));
      setExpandedContents(new Set(hotspotIds));
    } catch (err) {
      console.error('Failed to load data:', err);
      error('加载数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [dashboardFilters, currentPage, pageSize, error]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dashboardFilters]);

  useEffect(() => {
    const activeKeywords = keywords.filter(k => k.isActive).map(k => k.text);
    
    if (activeKeywords.length > 0) {
      subscribeToKeywords(activeKeywords);
    }
    
    return () => {
      const prevKeywords = keywordsRef.current;
      const prevActive = prevKeywords.filter(k => k.isActive).map(k => k.text);
      const toUnsubscribe = prevActive.filter(k => !activeKeywords.includes(k));
      
      if (toUnsubscribe.length > 0) {
        unsubscribeFromKeywords(toUnsubscribe);
      }
      
      keywordsRef.current = keywords;
    };
  }, [keywords]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const unsubHotspot = onNewHotspot((hotspot) => {
      setHotspots(prev => {
        const exists = prev.some(h => h.id === hotspot.id);
        if (exists) return prev;
        return [hotspot as Hotspot, ...prev.slice(0, pageSize - 1)];
      });
      setExpandedReasons(prev => new Set([...prev, hotspot.id]));
      setExpandedContents(prev => new Set([...prev, hotspot.id]));
      showToast('发现新热点: ' + hotspot.title.slice(0, 30), 'success');
    });

    const unsubNotif = onNotification(() => {
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      unsubHotspot();
      unsubNotif();
    };
  }, [pageSize, showToast]);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    try {
      const keyword = await keywordsApi.create({ text: newKeyword.trim() });
      setKeywords(prev => [keyword, ...prev]);
      setNewKeyword('');
      success('关键词添加成功');
      subscribeToKeywords([keyword.text]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '添加失败';
      error(message);
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    try {
      await keywordsApi.delete(id);
      setKeywords(prev => prev.filter(k => k.id !== id));
      success('关键词已删除');
    } catch {
      error('删除失败');
    }
  };

  const handleToggleKeyword = async (id: string) => {
    try {
      const updated = await keywordsApi.toggle(id);
      setKeywords(prev => prev.map(k => k.id === id ? updated : k));
    } catch {
      error('操作失败');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const result = await hotspotsApi.search(searchQuery);
      setSearchResults(result.results);
      success(`找到 ${result.results.length} 条结果`);
    } catch {
      error('搜索失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await triggerHotspotCheck();
      success('热点检查已触发');
      setTimeout(loadData, 5000);
    } catch {
      error('触发失败');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSelectHotspot = (id: string) => {
    setSelectedHotspots(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllHotspots = () => {
    if (selectedHotspots.size === hotspots.length) {
      setSelectedHotspots(new Set());
    } else {
      setSelectedHotspots(new Set(hotspots.map(h => h.id)));
    }
  };

  const handleDeleteHotspots = async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedHotspots);
      
      const result = await hotspotsApi.deleteBatch(ids);

      success(`成功删除 ${result.deletedCount} 条热点数据`);

      setSelectedHotspots(new Set());
      await loadData();
    } catch {
      error('删除操作失败');
    } finally {
      setIsDeleting(false);
    }
  };

  // 单个热点删除
  const handleDeleteHotspot = (id: string) => {
    setConfirmDialogConfig({
      title: '确认删除',
      message: '确定要删除这条热点数据吗？此操作不可撤销。',
      onConfirm: async () => {
        try {
          await hotspotsApi.delete(id);
          success('热点已删除');
          await loadData();
        } catch {
          error('删除失败');
        }
      }
    });
    setShowConfirmDialog(true);
  };

  // 删除通知
  const handleDeleteNotification = (id: string) => {
    setConfirmDialogConfig({
      title: '确认删除',
      message: '确定要删除这条通知吗？',
      onConfirm: async () => {
        try {
          await notificationsApi.delete(id);
          setNotifications(prev => prev.filter(n => n.id !== id));
          success('通知已删除');
        } catch {
          error('删除失败');
        }
      }
    });
    setShowConfirmDialog(true);
  };

  // 清空所有通知
  const handleClearAllNotifications = () => {
    setConfirmDialogConfig({
      title: '清空所有通知',
      message: '确定要清空所有通知吗？此操作不可撤销。',
      onConfirm: async () => {
        try {
          await notificationsApi.clear();
          setNotifications([]);
          setUnreadCount(0);
          success('所有通知已清空');
        } catch {
          error('清空失败');
        }
      }
    });
    setShowConfirmDialog(true);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const toggleReason = (id: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setExpandedContents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleContent = (id: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setExpandedContents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllReasons = (list: Hotspot[]) => {
    if (allReasonsExpanded) {
      setExpandedReasons(new Set());
      setExpandedContents(new Set());
    } else {
      setExpandedReasons(new Set(list.filter(h => h.relevanceReason).map(h => h.id)));
      setExpandedContents(new Set(list.filter(h => h.content && h.content !== h.summary).map(h => h.id)));
    }
    setAllReasonsExpanded(!allReasonsExpanded);
  };

  const filteredSearchResults = useMemo(() => {
    let results = [...searchResults];

    if (searchFilters.source) {
      results = results.filter(h => h.source === searchFilters.source);
    }
    if (searchFilters.importance) {
      results = results.filter(h => h.importance === searchFilters.importance);
    }
    if (searchFilters.isReal === 'true') {
      results = results.filter(h => h.isReal);
    } else if (searchFilters.isReal === 'false') {
      results = results.filter(h => !h.isReal);
    }
    if (searchFilters.keywordId) {
      results = results.filter(h => h.keyword?.id === searchFilters.keywordId);
    }
    if (searchFilters.timeRange) {
      const now = new Date();
      let dateFrom: Date | null = null;
      switch (searchFilters.timeRange) {
        case '1h': dateFrom = new Date(now.getTime() - 60 * 60 * 1000); break;
        case 'today': dateFrom = new Date(now); dateFrom.setHours(0, 0, 0, 0); break;
        case '7d': dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      }
      if (dateFrom) {
        results = results.filter(h => new Date(h.createdAt) >= dateFrom!);
      }
    }

    results = sortHotspots(results, searchFilters.sortBy || 'createdAt', (searchFilters.sortOrder || 'desc') as 'asc' | 'desc');

    return results;
  }, [searchResults, searchFilters]);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'twitter': return <Twitter className="w-4 h-4" />;
      case 'bilibili': return <Eye className="w-4 h-4" />;
      case 'weibo': return <Activity className="w-4 h-4" />;
      case 'sogou': return <Search className="w-4 h-4" />;
      case 'hackernews': return <Zap className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      twitter: 'Twitter',
      bing: 'Bing',
      google: 'Google',
      sogou: '搜狗',
      bilibili: 'Bilibili',
      weibo: '微博热搜',
      hackernews: 'HackerNews',
      duckduckgo: 'DuckDuckGo',
      zhihu: '知乎',
      toutiao: '今日头条',
      douyin: '抖音',
      weixin: '微信',
      baidu: '百度'
    };
    return labels[source] || source;
  };

  const getImportanceBgClass = (importance: string) => {
    switch (importance) {
      case 'urgent': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20';
      case 'high': return 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20';
      case 'medium': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] relative overflow-hidden">
      <BackgroundBeams className="z-0" />
      {isDark && <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#3b82f6" />}
      
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-blue-500/5 dark:bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/5 dark:bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <Toast toasts={toasts} onRemove={removeToast} />

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false);
          setConfirmDialogConfig(null);
        }}
        onConfirm={confirmDialogConfig?.onConfirm || handleDeleteHotspots}
        title={confirmDialogConfig?.title || '确认删除'}
        message={confirmDialogConfig?.message || `确定要删除选中的 ${selectedHotspots.size} 条热点数据吗？此操作不可撤销。`}
        confirmText="确认"
        cancelText="取消"
        danger={true}
      />

      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[var(--bg-surface)]/80 dark:bg-[var(--bg-surface)]/70 border-b border-[var(--border-default)]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Flame className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--bg-base)] animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[var(--text-primary)]">越疆情报局</h1>
                <p className="text-xs text-[var(--text-muted)]">协作机器人</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                onClick={toggleTheme}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
                title={isDark ? '切换到白天模式' : '切换到夜间模式'}
              >
                {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </motion.button>

              <motion.button
                onClick={handleManualCheck}
                disabled={isChecking}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all",
                  isChecking 
                    ? "bg-blue-500/20 text-blue-500 dark:text-blue-400 cursor-wait"
                    : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                )}
              >
                <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
                {isChecking ? '扫描中' : '立即扫描'}
              </motion.button>

              <div className="relative">
                <button
                  onClick={() => {
                    const newState = !showNotifications;
                    setShowNotifications(newState);
                    if (newState && unreadCount > 0) {
                      notificationsApi.markAllAsRead().then(() => {
                        setUnreadCount(0);
                        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                      });
                    }
                  }}
                  className="relative p-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
                >
                  <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      className="absolute right-0 top-14 w-80 bg-[var(--modal-bg)] backdrop-blur-2xl rounded-2xl border border-[var(--border-default)] shadow-xl overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
                        <h3 className="font-medium text-[var(--text-primary)]">通知</h3>
                        <div className="flex items-center gap-2">
                          {notifications.length > 0 && (
                            <button 
                              onClick={handleClearAllNotifications} 
                              className="text-xs text-red-500 hover:text-red-600 dark:text-red-400"
                            >
                              清空
                            </button>
                          )}
                          {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400">
                              全部已读
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="text-[var(--text-muted)] text-sm text-center py-8">暂无通知</p>
                        ) : (
                          <div className="divide-y divide-[var(--border-subtle)]">
                            {notifications.slice(0, 5).map(n => (
                              <div key={n.id} className={cn("p-4 transition-colors hover:bg-[var(--bg-hover)] group", !n.isRead && 'bg-blue-500/5')}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{n.title}</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{n.content}</p>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteNotification(n.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-all flex-shrink-0"
                                    title="删除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8">
          {([
            { key: 'dashboard', label: '热点雷达', icon: Activity },
            { key: 'keywords', label: '监控词', icon: Target },
            { key: 'search', label: '搜索', icon: Search },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all",
                activeTab === key 
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative group p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden"
                >
                  <div className="relative">
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-2">
                      <Activity className="w-4 h-4" />
                      总热点
                    </div>
                    <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="relative group p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden"
                >
                  <div className="relative">
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-2">
                      <Clock className="w-4 h-4" />
                      今日新增
                    </div>
                    <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{stats.today}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="relative group p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden"
                >
                  {isDark && <Meteors number={6} />}
                  <div className="relative">
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      紧急热点
                    </div>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.urgent}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="relative group p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden"
                >
                  <div className="relative">
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-2">
                      <Target className="w-4 h-4" />
                      监控词
                    </div>
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{keywords.filter(k => k.isActive).length}</p>
                  </div>
                </motion.div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  实时热点流
                </h2>
                <div className="flex items-center gap-3">
                  {selectedHotspots.size > 0 && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={isDeleting}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除 ({selectedHotspots.size})
                    </motion.button>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">每 30 分钟自动更新</span>
                </div>
              </div>

              <div className="mb-5">
                <FilterSortBar
                  filters={dashboardFilters}
                  onChange={setDashboardFilters}
                  keywords={keywords}
                  stats={stats || undefined}
                />
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : hotspots.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-[var(--border-default)]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                    <Search className="w-8 h-8 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-[var(--text-muted)]">尚未发现热点</p>
                  <p className="text-sm text-[var(--text-muted)] mt-1 opacity-70">添加监控关键词开始追踪</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hotspots.some(h => h.relevanceReason) && (
                    <div className="flex justify-between items-center">
                      <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedHotspots.size === hotspots.length && hotspots.length > 0}
                          onChange={handleSelectAllHotspots}
                          className="w-3.5 h-3.5 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-blue-600 focus:ring-blue-500/50 cursor-pointer"
                        />
                        全选 ({hotspots.length})
                      </label>
                      <button
                        onClick={() => toggleAllReasons(hotspots)}
                        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-blue-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--bg-elevated)]"
                      >
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                        {allReasonsExpanded ? '展开所有理由' : '折叠所有理由'}
                      </button>
                    </div>
                  )}

                  {hotspots.map((hotspot, index) => (
                    <HotspotCard
                      key={hotspot.id}
                      hotspot={hotspot}
                      index={index}
                      expandedReasons={expandedReasons}
                      expandedContents={expandedContents}
                      onToggleReason={toggleReason}
                      onToggleContent={toggleContent}
                      isSelected={selectedHotspots.has(hotspot.id)}
                      onSelect={handleSelectHotspot}
                      showSelect={true}
                      onDelete={handleDeleteHotspot}
                    />
                  ))}
                </div>
              )}

              {totalPages > 1 && !isLoading && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={stats?.total || 0}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  showPageSizeSelector={true}
                  showTotal={true}
                  showJumpToPage={true}
                  siblingCount={1}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'keywords' && (
          <div className="space-y-6">
            <form onSubmit={handleAddKeyword} className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="输入要监控的关键词，如：GPT-5、AI编程、Cursor..."
                    className="w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <motion.button 
                  type="submit" 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-blue-500/25"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </motion.button>
              </div>
            </form>

            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {keywords.map((keyword, index) => (
                  <KeywordCard
                    key={keyword.id}
                    keyword={keyword}
                    index={index}
                    onToggle={handleToggleKeyword}
                    onDelete={handleDeleteKeyword}
                  />
                ))}
              </AnimatePresence>
            </div>

            {keywords.length === 0 && (
              <div className="text-center py-16 rounded-2xl border border-dashed border-[var(--border-default)]">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                  <Target className="w-8 h-8 text-[var(--text-muted)]" />
                </div>
                <p className="text-[var(--text-muted)]">还没有监控关键词</p>
                <p className="text-sm text-[var(--text-muted)] mt-1 opacity-70">添加你想追踪的技术热点词</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'search' && (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索热点内容..."
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <motion.button 
                  type="submit" 
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  搜索
                </motion.button>
              </div>
            </form>

            <FilterSortBar
              filters={searchFilters}
              onChange={setSearchFilters}
              keywords={keywords}
              stats={stats || undefined}
            />

            <div className="space-y-3">
              {filteredSearchResults.length === 0 && searchResults.length > 0 && (
                <div className="text-center py-12 rounded-2xl border border-dashed border-[var(--border-default)]">
                  <p className="text-[var(--text-muted)]">当前筛选条件下无结果</p>
                  <p className="text-sm text-[var(--text-muted)] mt-1 opacity-70">尝试调整筛选条件</p>
                </div>
              )}
              {filteredSearchResults.map((hotspot, index) => {
                const heatScore = Math.round(
                  (hotspot.likeCount ?? 0) * 2 + 
                  (hotspot.retweetCount ?? 0) * 3 + 
                  (hotspot.replyCount ?? 0) * 1.5 + 
                  (hotspot.commentCount ?? 0) * 1.5 + 
                  (hotspot.quoteCount ?? 0) * 2 + 
                  (hotspot.viewCount ?? 0) / 100
                );
                const heat = heatScore >= 80 ? { label: '爆', color: 'text-red-500' } :
                            heatScore >= 60 ? { label: '热', color: 'text-orange-500' } :
                            heatScore >= 40 ? { label: '温', color: 'text-amber-500' } :
                            heatScore >= 20 ? { label: '凉', color: 'text-blue-500' } :
                            { label: '冷', color: 'text-slate-400' };
                
                return (
                <motion.div 
                  key={hotspot.id} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="group p-5 rounded-2xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase flex items-center border", getImportanceBgClass(hotspot.importance))}>
                          {hotspot.importance === 'urgent' ? <AlertTriangle className="w-4 h-4" /> : 
                           hotspot.importance === 'high' ? <Flame className="w-4 h-4" /> :
                           hotspot.importance === 'medium' ? <Zap className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                          <span className="ml-1">{hotspot.importance}</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          {getSourceIcon(hotspot.source)}
                          {getSourceLabel(hotspot.source)}
                        </span>
                        {!hotspot.isReal && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            可疑
                          </span>
                        )}
                        <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-medium", heat.color)}>
                          <ThermometerSun className="w-3 h-3" />
                          {heat.label} {heatScore}
                        </span>
                      </div>
                      <h3 className="font-medium text-[var(--text-primary)] mb-2 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">{hotspot.title}</h3>
                      {hotspot.summary && (
                        <div className="mb-2">
                          <span className="text-[10px] text-blue-600 dark:text-blue-400/60 font-medium mr-1.5">AI 摘要</span>
                          <span className="text-sm text-[var(--text-secondary)]">{hotspot.summary}</span>
                        </div>
                      )}
                      {hotspot.authorName && (
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-[var(--text-muted)]" />
                          <span className="text-xs text-[var(--text-secondary)]">{hotspot.authorName}</span>
                          {hotspot.authorVerified && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">✓ 认证</span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Target className="w-3.5 h-3.5" />
                          相关性 {hotspot.relevance}%
                        </span>
                        {hotspot.likeCount != null && hotspot.likeCount > 0 && (
                          <span className="flex items-center gap-1" title="点赞">
                            <Zap className="w-3.5 h-3.5" />
                            {hotspot.likeCount.toLocaleString()}
                          </span>
                        )}
                        {hotspot.viewCount != null && hotspot.viewCount > 0 && (
                          <span className="flex items-center gap-1" title="浏览量">
                            <Eye className="w-3.5 h-3.5" />
                            {hotspot.viewCount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={hotspot.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-blue-500/20 text-[var(--text-muted)] hover:text-blue-500 dark:hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;