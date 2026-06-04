import { useState, useCallback, useEffect, useRef } from 'react';
import { hotspotsApi, notificationsApi, keywordsApi, triggerHotspotCheck, type Hotspot, type Keyword, type Stats, type Notification } from '../services/api';
import { onNewHotspot, onNotification, subscribeToKeywords } from '../services/socket';



export function useHotspots(pageSize: number, filters: Record<string, string | number>) {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFilterParams = useCallback(() => {
    const params: Record<string, string | number> = {
      limit: pageSize,
      page: currentPage,
    };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    return params;
  }, [pageSize, currentPage, filters]);

  const loadData = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const filterParams = buildFilterParams();
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

        const activeKeywords = keywordsData.filter(k => k.isActive).map(k => k.text);
        if (activeKeywords.length > 0) {
          subscribeToKeywords(activeKeywords);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, [buildFilterParams]);

  useEffect(() => {
    loadData();
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (manualCheckTimeoutRef.current) {
        clearTimeout(manualCheckTimeoutRef.current);
      }
    };
  }, [loadData]);

  useEffect(() => {
    const unsubHotspot = onNewHotspot((hotspot) => {
      setHotspots(prev => {
        const exists = prev.some(h => h.id === hotspot.id);
        if (exists) return prev;
        return [hotspot as Hotspot, ...prev.slice(0, pageSize - 1)];
      });
    });

    const unsubNotif = onNotification(() => {
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      unsubHotspot();
      unsubNotif();
    };
  }, [pageSize]);

  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
    }
  }, [currentPage, totalPages]);

  const handleManualCheck = useCallback(async () => {
    // 清理之前的 timeout
    if (manualCheckTimeoutRef.current) {
      clearTimeout(manualCheckTimeoutRef.current);
    }
    
    setIsChecking(true);
    try {
      await triggerHotspotCheck();
      manualCheckTimeoutRef.current = setTimeout(loadData, 5000);
    } catch (error) {
      console.error('Manual check failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, [loadData]);

  return {
    hotspots,
    keywords,
    stats,
    notifications,
    unreadCount,
    isLoading,
    isChecking,
    currentPage,
    totalPages,
    loadData,
    handlePageChange,
    handleManualCheck,
  };
}