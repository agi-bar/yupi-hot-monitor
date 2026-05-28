import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, Search, Plus, Bell, Trash2, 
  ExternalLink, RefreshCw, X, Check, AlertTriangle,
  Zap, TrendingUp, Clock, Target, Activity, MessageCircle, Eye,
  Repeat2, Quote, User, Shield, ShieldAlert,
  ChevronDown, ChevronUp, ChevronsUpDown, ThermometerSun, FileText,
  Settings
} from 'lucide-react';
import { 
  keywordsApi, hotspotsApi, notificationsApi, triggerHotspotCheck,
  type Keyword, type Hotspot, type Stats
} from './services/api';
import { onNewHotspot, onNotification, subscribeToKeywords } from './services/socket';
import { 
  NOTIFICATION_MAX_DISPLAY_COUNT,
  NOTIFICATION_MAX_LENGTH,
  type Notification 
} from './types/notification';
import { generateNotificationId } from './utils/idGenerator';
import { toNotification } from './utils/notificationConverter';
import { cn } from './lib/utils';
import { Spotlight } from './components/ui/spotlight';
import { BackgroundBeams } from './components/ui/background-beams';
import { Meteors } from './components/ui/meteors';
import FilterSortBar from './components/FilterSortBar';
import { defaultFilterState, type FilterState } from './constants/filters';
import { relativeTime, formatDateTime } from './utils/relativeTime';
import { buildFilterParams } from './utils/filterUtils';
import Pagination from './components/Pagination';
import ThemeToggle from './components/ThemeToggle';
import SourcesManager from './components/SourcesManager';
import ConfirmDialog from './components/ConfirmDialog';
import NotificationPanel from './components/NotificationPanel';
import { useTheme } from './hooks/useTheme';
import { getSourceLabel, getSourceIcon } from './services/sourcesConfig';
import { useFilteredHotspots } from './hooks/useFilteredHotspots';
// TextGenerateEffect available for future use

/** 计算热度综合指标（归一化 0-100） */
function calcHeatScore(h: Hotspot): number {
  const likes = h.likeCount ?? 0;
  const retweets = h.retweetCount ?? 0;
  const replies = h.replyCount ?? 0;
  const comments = h.commentCount ?? 0;
  const quotes = h.quoteCount ?? 0;
  const views = h.viewCount ?? 0;
  // 加权公式：转发最重、其次点赞、然后评论/回复
  const raw = likes * 2 + retweets * 3 + replies * 1.5 + comments * 1.5 + quotes * 2 + views / 100;
  // log 压缩到 0-100
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}

function getHeatLevel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: '爆', color: 'text-red-400' };
  if (score >= 60) return { label: '热', color: 'text-orange-400' };
  if (score >= 40) return { label: '温', color: 'text-amber-400' };
  if (score >= 20) return { label: '凉', color: 'text-blue-400' };
  return { label: '冷', color: 'text-slate-500' };
}

function App() {
  useTheme();
  
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef(notifications);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const [newKeyword, setNewKeyword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keywords' | 'search' | 'sources'>('dashboard');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dashboardFilters, setDashboardFilters] = useState<FilterState>({ ...defaultFilterState });
  const [searchFilters, setSearchFilters] = useState<FilterState>({ ...defaultFilterState });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchResults, setSearchResults] = useState<Hotspot[]>([]);
  // 展开/折叠状态
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
  const [expandedContents, setExpandedContents] = useState<Set<string>>(new Set()); // 原始内容默认展开
  const [allReasonsExpanded, setAllReasonsExpanded] = useState(false);
  // 热点选择状态
  const [selectedHotspots, setSelectedHotspots] = useState<Set<string>>(new Set());

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isLoading?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isLoading: false,
    onConfirm: () => {}
  });

  // 热点跳转状态
  const [navigatingHotspotId, setNavigatingHotspotId] = useState<string | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filterParams = {
        ...buildFilterParams(dashboardFilters),
        limit: pageSize,
        page: currentPage,
      };

      const [keywordsData, hotspotsData, statsData, notifData] = await Promise.all([
        keywordsApi.getAll(),
        hotspotsApi.getAll(filterParams as Record<string, string | number>),
        hotspotsApi.getStats(),
        notificationsApi.getAll({ limit: 20 })
      ]);
      setKeywords(keywordsData);
      setHotspots(hotspotsData.data);
      // 自动展开所有原始内容
      setExpandedContents(new Set(hotspotsData.data.map((h: Hotspot) => h.id)));
      setTotalPages(hotspotsData.pagination.totalPages);
      setTotal(hotspotsData.pagination.total);
      setStats(statsData);
      setNotifications((notifData.data as unknown[]).map(toNotification));
      setUnreadCount(notifData.unreadCount);
      setNotificationPage(1);
      setHasMoreNotifications(notifData.pagination.page < notifData.pagination.totalPages);

      // 订阅关键词
      const activeKeywords = keywordsData.filter(k => k.isActive).map(k => k.text);
      if (activeKeywords.length > 0) {
        subscribeToKeywords(activeKeywords);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dashboardFilters, currentPage, pageSize]);

  // 当筛选条件变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
    // 更新 URL 参数
    const url = new URL(window.location.href);
    url.searchParams.set('page', '1');
    window.history.replaceState({}, '', url.toString());
  }, [dashboardFilters]);

  // 页面大小变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
    // 更新 URL 参数
    const url = new URL(window.location.href);
    url.searchParams.set('page', '1');
    window.history.replaceState({}, '', url.toString());
  }, [pageSize]);

  // 从 URL 初始化分页参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const size = params.get('pageSize');
    
    if (page) {
      const pageNum = parseInt(page);
      if (!isNaN(pageNum) && pageNum > 0) {
        setCurrentPage(pageNum);
      }
    }
    
    if (size) {
      const sizeNum = parseInt(size);
      if (!isNaN(sizeNum) && [5, 10, 20, 50, 100].includes(sizeNum)) {
        setPageSize(sizeNum);
      }
    }
  }, []);

  // 页码变化时更新 URL
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', currentPage.toString());
    window.history.replaceState({}, '', url.toString());
  }, [currentPage]);

  // 页面大小变化时更新 URL
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('pageSize', pageSize.toString());
    window.history.replaceState({}, '', url.toString());
  }, [pageSize]);

  // 同步notifications到ref
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket 事件
  useEffect(() => {
    const unsubHotspot = onNewHotspot((hotspot) => {
      setHotspots(prev => [hotspot as Hotspot, ...prev.slice(0, 19)]);
      showToast('发现新热点: ' + hotspot.title.slice(0, NOTIFICATION_MAX_LENGTH.TITLE), 'success');
      loadData();
    });

    const unsubNotif = onNotification((notification) => {
      const newNotification: Notification = {
        id: generateNotificationId(),
        type: notification.type,
        title: notification.title,
        content: notification.content,
        isRead: false,
        createdAt: new Date().toISOString(),
        hotspotId: notification.hotspotId,
      };
      
      const exists = notificationsRef.current.some(n => 
        notification.hotspotId && n.hotspotId === notification.hotspotId
      );
      if (!exists) {
        setUnreadCount(c => c + 1);
        setNotifications(prev => [newNotification, ...prev.slice(0, 19)]);
      }
      showToast(`新通知: ${notification.title.slice(0, NOTIFICATION_MAX_LENGTH.TITLE - 5)}...`, 'success');
    });

    return () => {
      unsubHotspot();
      unsubNotif();
    };
  }, [loadData]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 添加关键词
  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    const keywordText = newKeyword.trim();
    try {
      const keyword = await keywordsApi.create({ text: keywordText });
      setKeywords(prev => [keyword, ...prev]);
      setNewKeyword('');
      showToast('关键词添加成功', 'success');
      subscribeToKeywords([keyword.text]);
    } catch (error: unknown) {
      setNewKeyword(keywordText);  // 恢复输入框内容
      const message = error instanceof Error ? error.message : '添加失败';
      console.error('Failed to add keyword:', error);
      showToast(message, 'error');
    }
  };

  // 删除关键词
  const handleDeleteKeyword = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除关键词',
      message: '确定要删除这个监控关键词吗？删除后相关热点将不再追踪。',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        const previousKeywords = keywords;
        try {
          await keywordsApi.delete(id);
          setKeywords(prev => prev.filter(k => k.id !== id));
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
          showToast('关键词已删除', 'success');
        } catch (error) {
          setKeywords(previousKeywords);
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('删除关键词失败:', error);
          showToast('删除失败', 'error');
        }
      }
    });
  };

  // 切换关键词状态
  const handleToggleKeyword = async (id: string) => {
    const previousKeywords = keywords;
    try {
      const updated = await keywordsApi.toggle(id);
      setKeywords(prev => prev.map(k => k.id === id ? updated : k));
    } catch (error) {
      setKeywords(previousKeywords);
      console.error('Failed to toggle keyword:', error);
      showToast('操作失败', 'error');
    }
  };

  // 删除热点数据
  const handleDeleteHotspot = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除热点',
      message: '确定要删除这条热点数据吗？此操作无法撤销。',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        
        const currentHotspots = hotspots;
        const pageToUse = currentPage;
        const totalPagesCount = totalPages;
        
        // 如果是最后一页且只有一条数据，删除后需要回到上一页
        const shouldGoToPrevPage = pageToUse === totalPagesCount && 
                                    currentHotspots.length === 1 && 
                                    pageToUse > 1;
        
        try {
          // 先调用 API 删除
          const deletePromise = hotspotsApi.delete(id);
          
          // 更新 URL（如果需要）
          if (shouldGoToPrevPage) {
            const newPage = pageToUse - 1;
            const url = new URL(window.location.href);
            url.searchParams.set('page', newPage.toString());
            window.history.replaceState({}, '', url.toString());
            setCurrentPage(newPage);
          }
          
          // 等待删除完成
          await deletePromise;
          
          // 删除成功后重新加载数据
          await loadData();
          
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
          showToast('热点已删除', 'success');
        } catch (error) {
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('删除热点失败:', error);
          showToast('删除失败', 'error');
        }
      }
    });
  };

  // 批量删除热点
  const handleBatchDeleteHotspots = async () => {
    if (selectedHotspots.size === 0) return;
    
    const selectedIds = Array.from(selectedHotspots);
    const count = selectedIds.length;
    
    setConfirmDialog({
      isOpen: true,
      title: '批量删除热点',
      message: `确定要删除选中的 ${count} 条热点数据吗？此操作无法撤销。`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        try {
          await hotspotsApi.batchDelete(selectedIds);
          setSelectedHotspots(new Set());
          await loadData();
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
          showToast(`${count} 条热点已删除`, 'success');
        } catch (error) {
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('批量删除热点失败:', error);
          showToast('批量删除失败', 'error');
        }
      }
    });
  };

  // 切换热点选择
  const toggleHotspotSelection = (id: string) => {
    setSelectedHotspots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 全选/取消全选热点
  const toggleSelectAllHotspots = () => {
    if (selectedHotspots.size === hotspots.length) {
      setSelectedHotspots(new Set());
    } else {
      setSelectedHotspots(new Set(hotspots.map(h => h.id)));
    }
  };

  // 手动搜索
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const result = await hotspotsApi.search(searchQuery);
      setSearchResults(result.results);
      showToast(`找到 ${result.results.length} 条结果`, 'success');
    } catch {
      showToast('搜索失败', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 手动触发检查
  const handleManualCheck = async () => {
    if (isChecking) {
      return;
    }
    
    setIsChecking(true);
    
    try {
      await triggerHotspotCheck();
      showToast('热点检查已触发', 'success');
      
      setTimeout(() => {
        loadData();
      }, 5000);
    } catch (error) {
      showToast('触发失败', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  // 标记单条通知为已读
  const handleMarkAsRead = async (id: string) => {
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    try {
      await notificationsApi.markAsRead(id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      setUnreadCount(previousUnreadCount);
      setNotifications(previousNotifications);
      console.error('Failed to mark notification as read:', error);
    }
  };

  // 标记所有通知为已读
  const handleMarkAllRead = async () => {
    const previousUnreadCount = unreadCount;
    const previousNotifications = notifications;
    try {
      await notificationsApi.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      setUnreadCount(previousUnreadCount);
      setNotifications(previousNotifications);
      console.error('Failed to mark all as read:', error);
    }
  };

  // 删除单条通知
  const handleDeleteNotification = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除通知',
      message: '确定要删除这条通知吗？',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        const previousNotifications = notifications;
        const notification = notifications.find(n => n.id === id);
        try {
          await notificationsApi.delete(id);
          setNotifications(prev => prev.filter(n => n.id !== id));
          if (notification && !notification.isRead) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (error) {
          setNotifications(previousNotifications);
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('删除通知失败:', error);
        }
      }
    });
  };

  // 清空所有通知
  const handleClearAllNotifications = async () => {
    setConfirmDialog({
      isOpen: true,
      title: '清空通知',
      message: '确定要清空所有通知吗？此操作无法撤销。',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        const previousNotifications = notifications;
        const previousUnreadCount = unreadCount;
        try {
          await notificationsApi.clear();
          setNotifications([]);
          setUnreadCount(0);
          setShowNotifications(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (error) {
          setNotifications(previousNotifications);
          setUnreadCount(previousUnreadCount);
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('清空通知失败:', error);
        }
      }
    });
  };

  // 加载更多通知
  const [notificationPage, setNotificationPage] = useState(1);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const loadMoreNotifications = async () => {
    try {
      const newPage = notificationPage + 1;
      const data = await notificationsApi.getAll({ page: newPage, limit: 20 });
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newNotifications = (data.data as unknown[]).map(toNotification).filter(n => !existingIds.has(n.id));
        return [...prev, ...newNotifications];
      });
      setNotificationPage(newPage);
      setHasMoreNotifications(data.pagination.page < data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load more notifications:', error);
    }
  };

  // 跳转到热点详情
  const navigateToHotspot = async (hotspotId: string) => {
    setShowNotifications(false);
    setNavigatingHotspotId(hotspotId);
    
    try {
      // 首先在当前页面的热点列表中查找
      const localHotspot = hotspots.find(h => h.id === hotspotId);
      
      if (localHotspot) {
        // 热点在当前页面，直接滚动到对应位置
        scrollToHotspotElement(hotspotId);
      } else {
        // 热点不在当前页面，需要切换到对应页面
        showToast(`正在定位热点...`, 'success');
        
        // 通过 API 查找热点所在页面
        const hotspot = await hotspotsApi.getById(hotspotId);
        
        if (!hotspot) {
          showToast(`热点不存在或已被删除`, 'error');
          return;
        }
        
        // 计算热点所在的页码
        // 使用热点列表查询来找到对应的页码
        const targetPage = await findHotspotPage(hotspotId);
        
        if (targetPage === -1) {
          showToast(`未找到热点，可能已被删除`, 'error');
          return;
        }
        
        // 切换到目标页面
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
          // 更新 URL
          const url = new URL(window.location.href);
          url.searchParams.set('page', targetPage.toString());
          window.history.replaceState({}, '', url.toString());
          
          // 等待数据加载完成后再滚动
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 滚动到对应位置
        scrollToHotspotElement(hotspotId);
      }
    } catch (error) {
      console.error('导航到热点失败:', error);
      showToast(`定位热点失败`, 'error');
    } finally {
      setNavigatingHotspotId(null);
    }
  };

  // 滚动到热点元素
  const scrollToHotspotElement = (hotspotId: string) => {
    const element = document.getElementById(`hotspot-${hotspotId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-blue-500', 'animate-pulse');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'animate-pulse');
      }, 3000);
    }
  };

  // 查找热点所在的页码
  const findHotspotPage = async (hotspotId: string): Promise<number> => {
    try {
      // 使用二分查找优化页码搜索
      let low = 1;
      let high = totalPages;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        
        // 查询对应页码的数据
        const pageData = await hotspotsApi.getAll({
          page: mid,
          limit: pageSize,
          ...dashboardFilters
        });
        
        // 检查该页是否包含目标热点
        const found = pageData.data.some(h => h.id === hotspotId);
        
        if (found) {
          return mid;
        }
        
        // 根据分页逻辑调整搜索范围
        // 这里简化处理，实际应该根据排序字段和 createdAt 来判断
        if (mid === low) {
          // 已经检查了最小页但没找到，说明热点可能已被删除或不在列表中
          return -1;
        }
        
        // 继续二分查找
        if (pageData.data.length > 0) {
          const lastItem = pageData.data[pageData.data.length - 1];
          if (new Date(lastItem.createdAt) > new Date()) {
            // 如果最后一页的创建时间比当前页最新，创建时间更早，应该向前找
            high = mid - 1;
          } else {
            // 创建时间更晚，应该向后找
            low = mid + 1;
          }
        } else {
          return -1;
        }
      }
      
      return -1;
    } catch (error) {
      console.error('查找热点页码失败:', error);
      return -1;
    }
  };

  // 处理页码变化
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 处理页面大小变化
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
  };

  // 展开/折叠相关性理由
  const toggleReason = (id: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 展开/折叠原始内容
  const toggleContent = (id: string) => {
    setExpandedContents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 一键展开/折叠所有相关性理由
  const toggleAllReasons = (list: Hotspot[]) => {
    if (allReasonsExpanded) {
      setExpandedReasons(new Set());
    } else {
      setExpandedReasons(new Set(list.filter(h => h.relevanceReason).map(h => h.id)));
    }
    setAllReasonsExpanded(!allReasonsExpanded);
  };

  // Client-side filtering/sorting for search results
  const filteredSearchResults = useFilteredHotspots({
    hotspots: searchResults,
    filters: searchFilters,
    enableClientFilter: true,
  });

  const getImportanceIcon = (importance: string) => {
    switch (importance) {
      case 'urgent': return <AlertTriangle className="w-4 h-4" />;
      case 'high': return <Flame className="w-4 h-4" />;
      case 'medium': return <Zap className="w-4 h-4" />;
      default: return <TrendingUp className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050510] relative overflow-hidden">
      {/* Background Effects */}
      <BackgroundBeams className="z-0" />
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#3b82f6" />
      
      {/* Subtle gradient orbs */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isLoading={confirmDialog.isLoading}
        onConfirm={() => {
          confirmDialog.onConfirm();
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }))}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-6 left-1/2 z-50 px-5 py-3 rounded-xl backdrop-blur-xl flex items-center gap-3 shadow-2xl",
              toast.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            )}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - Minimal & Clean */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#050510]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Flame className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#050510] animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight">越疆情报</h1>
                <p className="text-xs text-slate-500">AI 越疆情报</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <motion.button
                type="button"
                onClick={handleManualCheck}
                disabled={isChecking}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all cursor-pointer",
                  isChecking 
                    ? "bg-blue-500/20 text-blue-400 cursor-wait"
                    : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                )}
              >
                <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
                {isChecking ? '扫描中' : '立即扫描'}
              </motion.button>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all active:scale-95 cursor-pointer"
                >
                  <Bell className="w-5 h-5 text-slate-400 hover:text-slate-300 transition-colors" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                      {unreadCount > NOTIFICATION_MAX_DISPLAY_COUNT 
                        ? `${NOTIFICATION_MAX_DISPLAY_COUNT}+` 
                        : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <NotificationPanel
                      notifications={notifications}
                      unreadCount={unreadCount}
                      onMarkAsRead={handleMarkAsRead}
                      onDelete={handleDeleteNotification}
                      onMarkAllRead={handleMarkAllRead}
                      onClearAll={handleClearAllNotifications}
                      onNavigate={navigateToHotspot}
                      onLoadMore={loadMoreNotifications}
                      hasMore={hasMoreNotifications}
                      navigatingHotspotId={navigatingHotspotId}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8">
          {([
            { key: 'dashboard', label: '热点雷达', icon: Activity },
            { key: 'keywords', label: '监控词', icon: Target },
            { key: 'search', label: '搜索', icon: Search },
            { key: 'sources', label: '来源管理', icon: Settings },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all",
                activeTab === key 
                  ? 'bg-white/10 text-white border border-white/10' 
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Hero Stats */}
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative group p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/10 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                      <Activity className="w-4 h-4" />
                      总热点
                    </div>
                    <p className="text-3xl font-bold text-white">{stats.total}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="relative group p-5 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/10 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                      <Clock className="w-4 h-4" />
                      今日新增
                    </div>
                    <p className="text-3xl font-bold text-cyan-400">{stats.today}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="relative group p-5 rounded-2xl bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/10 overflow-hidden"
                >
                  <Meteors number={6} />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      紧急热点
                    </div>
                    <p className="text-3xl font-bold text-red-400">{stats.urgent}</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="relative group p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/10 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                      <Target className="w-4 h-4" />
                      监控词
                    </div>
                    <p className="text-3xl font-bold text-emerald-400">{keywords.filter(k => k.isActive).length}</p>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Hotspots Feed */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  实时热点流
                </h2>
                <span className="text-xs text-slate-600">每 30 分钟自动更新</span>
              </div>

              {/* Filter & Sort Bar */}
              <div className="mb-5">
                <FilterSortBar
                  filters={dashboardFilters}
                  onChange={setDashboardFilters}
                  keywords={keywords}
                />
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : hotspots.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                    <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-500">尚未发现热点</p>
                  <p className="text-sm text-slate-600 mt-1">添加监控关键词开始追踪</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 批量操作栏 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedHotspots.size === hotspots.length && hotspots.length > 0}
                          onChange={toggleSelectAllHotspots}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                        />
                        <span className="text-sm">
                          {selectedHotspots.size > 0 ? (
                            <span className="text-blue-400">已选择 {selectedHotspots.size} 项</span>
                          ) : (
                            <span className="text-slate-400">全选</span>
                          )}
                        </span>
                      </label>
                      {selectedHotspots.size > 0 && (
                        <button
                          onClick={handleBatchDeleteHotspots}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-sm font-medium transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                          批量删除
                        </button>
                      )}
                    </div>
                    {/* 一键展开/折叠所有理由 */}
                    {hotspots.some(h => h.relevanceReason) && (
                      <button
                        onClick={() => toggleAllReasons(hotspots)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                      >
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                        {allReasonsExpanded ? '折叠所有理由' : '展开所有理由'}
                      </button>
                    )}
                  </div>

                  {hotspots.map((hotspot, index) => {
                    const heatScore = calcHeatScore(hotspot);
                    const heat = getHeatLevel(heatScore);
                    const isSelected = selectedHotspots.has(hotspot.id);
                    return (
                    <motion.div
                      id={`hotspot-${hotspot.id}`}
                      key={hotspot.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={cn(
                        "group p-5 rounded-2xl border transition-all",
                        isSelected 
                          ? "bg-blue-500/5 border-blue-500/30 hover:bg-blue-500/10" 
                          : "bg-white/[0.02] hover:bg-white/[0.04] border-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* 选择框 */}
                        <div className="flex-shrink-0 pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleHotspotSelection(hotspot.id)}
                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Meta badges */}
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center",
                              hotspot.importance === 'urgent' && "bg-red-500/15 text-red-400 border border-red-500/20",
                              hotspot.importance === 'high' && "bg-orange-500/15 text-orange-400 border border-orange-500/20",
                              hotspot.importance === 'medium' && "bg-amber-500/15 text-amber-400 border border-amber-500/20",
                              hotspot.importance === 'low' && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                            )}>
                              {getImportanceIcon(hotspot.importance)}
                              <span className="ml-1">{hotspot.importance}</span>
                            </span>
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              {getSourceIcon(hotspot.source)}
                              {getSourceLabel(hotspot.source)}
                            </span>
                            {hotspot.keyword && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {hotspot.keyword.text}
                              </span>
                            )}
                            {/* 真实性标记 */}
                            {!hotspot.isReal && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                                <ShieldAlert className="w-3 h-3" />
                                可疑
                              </span>
                            )}
                            {hotspot.isReal && hotspot.relevance >= 80 && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Shield className="w-3 h-3" />
                                可信
                              </span>
                            )}
                            {hotspot.keywordMentioned === true && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Target className="w-3 h-3" />
                                直接提及
                              </span>
                            )}
                            {hotspot.keywordMentioned === false && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                <Target className="w-3 h-3" />
                                间接相关
                              </span>
                            )}
                            {/* 热度综合指标 */}
                            <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-medium", heat.color)}>
                              <ThermometerSun className="w-3 h-3" />
                              {heat.label} {heatScore}
                            </span>
                          </div>
                          
                          {/* Title */}
                          <h3 className="font-medium text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                            {hotspot.title}
                          </h3>
                          
                          {/* AI Summary - 标注 */}
                          {hotspot.summary && (
                            <div className="mb-3">
                              <span className="text-[10px] text-blue-400/60 font-medium mr-1.5">AI 摘要</span>
                              <span className="text-sm text-slate-500">{hotspot.summary}</span>
                            </div>
                          )}

                          {/* 作者信息 */}
                          {hotspot.authorName && (
                            <div className="flex items-center gap-2 mb-3">
                              {hotspot.authorAvatar ? (
                                <img src={hotspot.authorAvatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <User className="w-4 h-4 text-slate-600" />
                              )}
                              <span className="text-xs text-slate-400">
                                {hotspot.authorName}
                                {hotspot.authorUsername && <span className="text-slate-600 ml-1">@{hotspot.authorUsername}</span>}
                              </span>
                              {hotspot.authorVerified && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">✓ 认证</span>
                              )}
                              {hotspot.authorFollowers != null && hotspot.authorFollowers > 0 && (
                                <span className="text-[10px] text-slate-600">{hotspot.authorFollowers.toLocaleString()} 粉丝</span>
                              )}
                            </div>
                          )}
                          
                          {/* 互动数据 */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-2">
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
                            {hotspot.retweetCount != null && hotspot.retweetCount > 0 && (
                              <span className="flex items-center gap-1" title="转发">
                                <Repeat2 className="w-3.5 h-3.5" />
                                {hotspot.retweetCount.toLocaleString()}
                              </span>
                            )}
                            {hotspot.replyCount != null && hotspot.replyCount > 0 && (
                              <span className="flex items-center gap-1" title="回复">
                                <MessageCircle className="w-3.5 h-3.5" />
                                {hotspot.replyCount.toLocaleString()}
                              </span>
                            )}
                            {hotspot.commentCount != null && hotspot.commentCount > 0 && (
                              <span className="flex items-center gap-1" title="评论">
                                <MessageCircle className="w-3.5 h-3.5" />
                                {hotspot.commentCount.toLocaleString()}
                              </span>
                            )}
                            {hotspot.quoteCount != null && hotspot.quoteCount > 0 && (
                              <span className="flex items-center gap-1" title="引用">
                                <Quote className="w-3.5 h-3.5" />
                                {hotspot.quoteCount.toLocaleString()}
                              </span>
                            )}
                            {hotspot.viewCount != null && hotspot.viewCount > 0 && (
                              <span className="flex items-center gap-1" title="浏览量">
                                <Eye className="w-3.5 h-3.5" />
                                {hotspot.viewCount.toLocaleString()}
                              </span>
                            )}
                            {hotspot.danmakuCount != null && hotspot.danmakuCount > 0 && (
                              <span className="flex items-center gap-1" title="弹幕">
                                💬 {hotspot.danmakuCount.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* 时间信息 */}
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                            {hotspot.publishedAt ? (
                              <span className="flex items-center gap-1" title={`发布于 ${formatDateTime(hotspot.publishedAt)}`}>
                                <Clock className="w-3 h-3" />
                                发布 {relativeTime(hotspot.publishedAt)}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1" title={`抓取于 ${formatDateTime(hotspot.createdAt)}`}>
                                <Activity className="w-3 h-3" />
                                抓取 {relativeTime(hotspot.createdAt)}
                              </span>
                            )}
                          </div>

                          {/* AI 相关性理由 - 可折叠 */}
                          {hotspot.relevanceReason && (
                            <div className="mt-2">
                              <button
                                onClick={() => toggleReason(hotspot.id)}
                                className="flex items-center gap-1 text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors"
                              >
                                {expandedReasons.has(hotspot.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                AI 分析理由
                              </button>
                              <AnimatePresence>
                                {expandedReasons.has(hotspot.id) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <p className="text-xs text-slate-500 mt-1 pl-4 border-l-2 border-blue-500/20">
                                      {hotspot.relevanceReason}
                                    </p>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* 原始内容 - 可折叠 */}
                          {hotspot.content && hotspot.content !== hotspot.summary && (
                            <div className="mt-2">
                              <button
                                onClick={() => toggleContent(hotspot.id)}
                                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                {expandedContents.has(hotspot.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                <FileText className="w-3 h-3" />
                                原始内容
                              </button>
                              <AnimatePresence>
                                {expandedContents.has(hotspot.id) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-2 pl-4 border-l-2 border-white/10 space-y-3">
                                      {/* AI 分析信息 */}
                                      {hotspot.summary && (
                                        <div className="bg-blue-500/5 rounded-lg p-2 border border-blue-500/10">
                                          <div className="text-[10px] text-blue-400 mb-1">📝 AI 摘要</div>
                                          <p className="text-xs text-slate-400">{hotspot.summary}</p>
                                        </div>
                                      )}
                                      
                                      {/* 相关性理由 */}
                                      {hotspot.relevanceReason && (
                                        <div className="bg-purple-500/5 rounded-lg p-2 border border-purple-500/10">
                                          <div className="text-[10px] text-purple-400 mb-1">🧠 AI 分析理由</div>
                                          <p className="text-xs text-slate-400">{hotspot.relevanceReason}</p>
                                        </div>
                                      )}
                                      
                                      {/* 质量指标 */}
                                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="flex items-center gap-1 text-slate-500">
                                          <Target className="w-3 h-3" />
                                          <span className="ml-1">相关性: {hotspot.relevance}%</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-500">
                                          {getSourceIcon(hotspot.source)}
                                          <span>{getSourceLabel(hotspot.source)}</span>
                                        </div>
                                        {hotspot.keywordMentioned !== null && (
                                          <div className="col-span-2 flex items-center gap-1">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${hotspot.keywordMentioned ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                              {hotspot.keywordMentioned ? '✅ 关键词直接提及' : '⚠️ 关键词间接相关'}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 发布信息和互动数据 */}
                                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
                                        {hotspot.publishedAt && (
                                          <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDateTime(hotspot.publishedAt)}
                                          </span>
                                        )}
                                        {hotspot.authorName && (
                                          <span className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {hotspot.authorName}
                                            {hotspot.authorFollowers && ` (${hotspot.authorFollowers.toLocaleString()} 粉丝)`}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* 互动数据详情 */}
                                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                                        {hotspot.viewCount != null && hotspot.viewCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <Eye className="w-3 h-3" />
                                            <span>{hotspot.viewCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {hotspot.likeCount != null && hotspot.likeCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <Zap className="w-3 h-3" />
                                            <span>{hotspot.likeCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {hotspot.retweetCount != null && hotspot.retweetCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <Repeat2 className="w-3 h-3" />
                                            <span>{hotspot.retweetCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {hotspot.replyCount != null && hotspot.replyCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <MessageCircle className="w-3 h-3" />
                                            <span>{hotspot.replyCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {hotspot.commentCount != null && hotspot.commentCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <MessageCircle className="w-3 h-3" />
                                            <span>{hotspot.commentCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {hotspot.quoteCount != null && hotspot.quoteCount > 0 && (
                                          <div className="flex items-center gap-1 text-slate-500 bg-white/5 rounded px-2 py-1">
                                            <Quote className="w-3 h-3" />
                                            <span>{hotspot.quoteCount.toLocaleString()}</span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 完整内容 */}
                                      <div>
                                        <div className="text-[10px] text-slate-600 mb-1">📄 原始内容</div>
                                        <p className="text-xs text-slate-500 whitespace-pre-wrap break-words">
                                          {hotspot.content}
                                        </p>
                                      </div>
                                      
                                      {/* 来源链接 */}
                                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                        <a
                                          href={hotspot.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          查看原文
                                        </a>
                                        {hotspot.authorUsername && (
                                          <span className="text-[10px] text-slate-600">
                                            @{hotspot.authorUsername}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <a
                            href={hotspot.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHotspot(hotspot.id);
                            }}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {!isLoading && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}
            </div>
          </div>
        )}

        {/* Keywords Tab */}
        {activeTab === 'keywords' && (
          <div className="space-y-6">
            {/* Add Keyword Card */}
            <form onSubmit={handleAddKeyword} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="输入要监控的关键词，如：GPT-5、AI编程、Cursor..."
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
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

            {/* Keywords Grid */}
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {keywords.map((keyword, i) => (
                  <motion.div
                    key={keyword.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.02 }}
                    className={cn(
                      "group p-4 rounded-xl border transition-all",
                      keyword.isActive 
                        ? "bg-white/[0.03] border-blue-500/20 hover:border-blue-500/30" 
                        : "bg-white/[0.01] border-white/5 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleKeyword(keyword.id)}
                          className={cn(
                            "w-11 h-6 rounded-full transition-all relative",
                            keyword.isActive ? "bg-blue-500" : "bg-slate-700"
                          )}
                        >
                          <span className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all",
                            keyword.isActive ? "left-6" : "left-1"
                          )} />
                        </button>
                        
                        <div>
                          <span className={cn("font-medium", keyword.isActive ? "text-white" : "text-slate-500")}>
                            {keyword.text}
                          </span>
                          {keyword._count && keyword._count.hotspots > 0 && (
                            <span className="ml-2 text-xs text-slate-600">
                              {keyword._count.hotspots} 条热点
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteKeyword(keyword.id)}
                        className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {keywords.length === 0 && (
              <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <Target className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-500">还没有监控关键词</p>
                <p className="text-sm text-slate-600 mt-1">添加你想追踪的技术热点词</p>
              </div>
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Form */}
            <form onSubmit={handleSearch} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 transition-colors" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索热点内容..."
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all hover:border-white/20"
                  />
                </div>
                <motion.button 
                  type="submit" 
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-50 hover:shadow-blue-500/40 transition-shadow cursor-pointer"
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

            {/* Search Filter & Sort Bar */}
            <FilterSortBar
              filters={searchFilters}
              onChange={setSearchFilters}
              keywords={keywords}
            />

            {/* Search Results */}
            <div className="space-y-3">
              {searchResults.length === 0 && !isLoading && (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                    <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-500">输入关键词搜索热点</p>
                  <p className="text-sm text-slate-600 mt-1">输入要搜索的内容获取相关热点</p>
                </div>
              )}
              {filteredSearchResults.length === 0 && searchResults.length > 0 && (
                <div className="text-center py-12 rounded-2xl border border-dashed border-white/10">
                  <p className="text-slate-500">当前筛选条件下无结果</p>
                  <p className="text-sm text-slate-600 mt-1">尝试调整筛选条件</p>
                </div>
              )}
              {filteredSearchResults.map((hotspot, i) => {
                const heatScore = calcHeatScore(hotspot);
                const heat = getHeatLevel(heatScore);
                return (
                <motion.div 
                  id={`hotspot-${hotspot.id}`}
                  key={hotspot.id} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group p-5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase flex items-center",
                          hotspot.importance === 'urgent' && "bg-red-500/15 text-red-400 border border-red-500/20",
                          hotspot.importance === 'high' && "bg-orange-500/15 text-orange-400 border border-orange-500/20",
                          hotspot.importance === 'medium' && "bg-amber-500/15 text-amber-400 border border-amber-500/20",
                          hotspot.importance === 'low' && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        )}>
                          {getImportanceIcon(hotspot.importance)}
                          <span className="ml-1">{hotspot.importance}</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-600">
                          {getSourceIcon(hotspot.source)}
                          {getSourceLabel(hotspot.source)}
                        </span>
                        {!hotspot.isReal && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                            <ShieldAlert className="w-3 h-3" />
                            可疑
                          </span>
                        )}
                        <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-medium", heat.color)}>
                          <ThermometerSun className="w-3 h-3" />
                          {heat.label} {heatScore}
                        </span>
                      </div>
                      <h3 className="font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">{hotspot.title}</h3>
                      {hotspot.summary && (
                        <div className="mb-2">
                          <span className="text-[10px] text-blue-400/60 font-medium mr-1.5">AI 摘要</span>
                          <span className="text-sm text-slate-500">{hotspot.summary}</span>
                        </div>
                      )}
                      {hotspot.authorName && (
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-slate-600" />
                          <span className="text-xs text-slate-400">{hotspot.authorName}</span>
                          {hotspot.authorVerified && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">✓ 认证</span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
                      <div className="flex items-center gap-1 text-[11px] text-slate-600 mt-1">
                        {hotspot.publishedAt ? (
                          <span title={formatDateTime(hotspot.publishedAt)}>
                            <Clock className="w-3 h-3 inline" />
                            发布 {relativeTime(hotspot.publishedAt)}
                          </span>
                        ) : (
                          <span title={formatDateTime(hotspot.createdAt)}>
                            <Activity className="w-3 h-3 inline" />
                            抓取 {relativeTime(hotspot.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={hotspot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium transition-all"
                      >
                        查看
                      </a>
                      <button
                        onClick={() => handleDeleteHotspot(hotspot.id)}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-all"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <SourcesManager />
        )}
      </main>
    </div>
  );
}

export default App;
