import type { FilterState, TimeRangeValue } from '../constants/filters';
import type { Hotspot } from '../services/api';

export type { TimeRangeValue } from '../constants/filters';

export const TIME_RANGE_MS: Record<TimeRangeValue, number | null> = {
  '': null,
  '1h': 60 * 60 * 1000,
  'today': getStartOfDayMs(),
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function getStartOfDayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

export function parseTimeRange(timeRange: TimeRangeValue): Date | null {
  if (!timeRange) return null;
  const ms = TIME_RANGE_MS[timeRange];
  if (!ms) return null;
  return new Date(Date.now() - ms);
}

export function buildFilterParams(filters: FilterState): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  if (filters.source) params.source = filters.source;
  if (filters.sourceRecordId) params.sourceRecordId = filters.sourceRecordId;
  if (filters.importance) params.importance = filters.importance;
  if (filters.keywordId) params.keywordId = filters.keywordId;
  if (filters.timeRange) params.timeRange = filters.timeRange;
  if (filters.isReal) params.isReal = filters.isReal;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortOrder) params.sortOrder = filters.sortOrder;

  return params;
}

export interface FilterOptions {
  source?: string;
  importance?: string;
  keywordId?: string;
  timeRange?: TimeRangeValue;
  isReal?: string;
}

export function filterHotspots(hotspots: Hotspot[], options: FilterOptions): Hotspot[] {
  let results = [...hotspots];

  if (options.source) {
    results = results.filter(h => h.source === options.source);
  }

  if (options.importance) {
    results = results.filter(h => h.importance === options.importance);
  }

  if (options.keywordId) {
    results = results.filter(h => h.keyword?.id === options.keywordId);
  }

  if (options.isReal === 'true') {
    results = results.filter(h => h.isReal);
  } else if (options.isReal === 'false') {
    results = results.filter(h => !h.isReal);
  }

  if (options.timeRange) {
    const dateFrom = parseTimeRange(options.timeRange);
    if (dateFrom) {
      results = results.filter(h => new Date(h.createdAt) >= dateFrom);
    }
  }

  return results;
}

export function isActiveFilter(filters: FilterState): boolean {
  return [
    filters.source,
    filters.importance,
    filters.keywordId,
    filters.timeRange,
    filters.isReal,
  ].some(v => v !== '');
}

export function countActiveFilters(filters: FilterState): number {
  return [
    filters.source,
    filters.importance,
    filters.keywordId,
    filters.timeRange,
    filters.isReal,
  ].filter(v => v !== '').length;
}

export function getDefaultFilterState(): FilterState {
  return {
    source: '',
    sourceRecordId: '',
    importance: '',
    keywordId: '',
    timeRange: '',
    isReal: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };
}
