import { useMemo } from 'react';
import type { FilterState } from '../constants/filters';
import type { Hotspot } from '../services/api';
import { filterHotspots } from '../utils/filterUtils';
import { sortHotspots } from '../utils/sortHotspots';

export interface UseFilteredHotspotsOptions {
  hotspots: Hotspot[];
  filters: FilterState;
  enableClientFilter?: boolean;
}

export function useFilteredHotspots({ 
  hotspots, 
  filters, 
  enableClientFilter = false 
}: UseFilteredHotspotsOptions) {
  return useMemo(() => {
    if (!enableClientFilter) {
      return hotspots;
    }

    const filtered = filterHotspots(hotspots, {
      source: filters.source || undefined,
      importance: filters.importance || undefined,
      keywordId: filters.keywordId || undefined,
      timeRange: filters.timeRange,
      isReal: filters.isReal || undefined,
    });

    return sortHotspots(
      filtered,
      filters.sortBy || 'createdAt',
      (filters.sortOrder || 'desc') as 'asc' | 'desc'
    );
  }, [hotspots, filters, enableClientFilter]);
}
