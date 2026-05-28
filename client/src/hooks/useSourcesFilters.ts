import { useState, useCallback } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

const DEBOUNCE_DELAY = 300;

export type SourceType = string;
export type SourceStatus = string;

interface SourceFilters {
  type: SourceType | '';
  category: string;
  status: SourceStatus | '';
  search: string;
}

const initialFilters: SourceFilters = {
  type: '',
  category: '',
  status: '',
  search: ''
};

export function useSourcesFilters() {
  const [filters, setFilters] = useState<SourceFilters>(initialFilters);
  const [page, setPage] = useState(1);

  const debouncedFilters = useDebouncedValue(filters, DEBOUNCE_DELAY);

  const updateFilters = useCallback((newFilters: Partial<SourceFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, []);

  const setType = useCallback((type: SourceType | '') => {
    updateFilters({ type });
  }, [updateFilters]);

  const setStatus = useCallback((status: SourceStatus | '') => {
    updateFilters({ status });
  }, [updateFilters]);

  const setSearch = useCallback((search: string) => {
    updateFilters({ search });
  }, [updateFilters]);

  const setCurrentPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const goToNextPage = useCallback(() => {
    setPage(p => p + 1);
  }, []);

  const goToPrevPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  return {
    filters,
    debouncedFilters,
    page,
    setFilters,
    updateFilters,
    resetFilters,
    setType,
    setStatus,
    setSearch,
    setPage: setCurrentPage,
    goToNextPage,
    goToPrevPage,
    isFirstPage: page === 1
  };
}
