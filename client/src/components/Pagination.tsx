import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  showPageSizeSelector?: boolean;
  showTotal?: boolean;
  showJumpToPage?: boolean;
  siblingCount?: number;
  isLoading?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
}

const defaultPageSizeOptions = [5, 10, 20, 50, 100];

function safeParseInt(value: string | number, defaultValue: number): number {
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) || parsed < 1 ? defaultValue : parsed;
}

function useDebounce<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  callbackRef.current = callback;
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return useCallback(((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }) as T, [delay]);
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 5,
  pageSizeOptions = defaultPageSizeOptions,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  showTotal = true,
  showJumpToPage = true,
  siblingCount = 1,
  isLoading = false,
  hasError = false,
  onRetry,
  disabled = false,
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('');
  const [showJumpInput, setShowJumpInput] = useState(false);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  const debouncedOnPageChange = useDebounce(onPageChange, 150);

  const handlePageClick = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !disabled && !isLoading) {
      debouncedOnPageChange(page);
    }
  }, [currentPage, totalPages, disabled, isLoading, debouncedOnPageChange]);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = safeParseInt(jumpValue, -1);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
    setJumpValue('');
    setShowJumpInput(false);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = safeParseInt(e.target.value, pageSize);
    if (onPageSizeChange && newSize !== pageSize) {
      onPageSizeChange(newSize);
    }
  };

  const handleJumpInputToggle = () => {
    setShowJumpInput(!showJumpInput);
    if (!showJumpInput) {
      setTimeout(() => jumpInputRef.current?.focus(), 100);
    } else {
      setJumpValue('');
    }
  };

  const range = (start: number, end: number) => {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const getPageNumbers = useMemo(() => {
    const totalPageNumbers = siblingCount * 2 + 5;

    if (totalPages <= totalPageNumbers) {
      return range(1, totalPages);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = 3 + 2 * siblingCount;
      return [...range(1, leftItemCount), -1, totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      return [1, -1, ...range(totalPages - rightItemCount + 1, totalPages)];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
      return [1, -1, ...range(leftSiblingIndex, rightSiblingIndex), -1, totalPages];
    }

    return range(1, totalPages);
  }, [currentPage, totalPages, siblingCount]);

  const pageNumbers = getPageNumbers;

  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;
  const hasOnlyOnePage = totalPages <= 1;
  const hasNoItems = totalItems === 0;

  if (hasNoItems && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
        <div className="text-center">
          <p className="text-sm text-[var(--text-muted)]">暂无数据</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">尝试调整筛选条件</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-active)] transition-all"
          >
            刷新
          </button>
        )}
      </div>
    );
  }

  if (hasOnlyOnePage && !showTotal) {
    return null;
  }

  return (
    <nav role="navigation" aria-label="分页导航" className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2 select-none">
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] order-2 sm:order-1">
        {showTotal && !hasNoItems && (
          <span className="whitespace-nowrap">显示 {startItem}-{endItem} 条，共 {totalItems} 条</span>
        )}
        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="page-size-select" className="hidden sm:inline whitespace-nowrap">每页</label>
            <select
              id="page-size-select"
              value={pageSize}
              onChange={handlePageSizeChange}
              disabled={disabled || isLoading}
              className="px-2 py-1 rounded-lg text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] cursor-pointer hover:border-[var(--border-active)] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="每页显示条数"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="hidden sm:inline whitespace-nowrap">条</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 order-1 sm:order-2" role="group" aria-label="页码导航">
        <motion.button
          onClick={() => handlePageClick(1)}
          disabled={isFirstPage || disabled || isLoading}
          whileHover={{ scale: disabled || isFirstPage ? 1 : 1.05 }}
          whileTap={{ scale: disabled || isFirstPage ? 1 : 0.95 }}
          className="hidden md:flex p-2 rounded-lg transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="首页"
          aria-label="跳转到第一页"
          aria-disabled={isFirstPage}
        >
          <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
        </motion.button>

        <motion.button
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={isFirstPage || disabled || isLoading}
          whileHover={{ scale: disabled || isFirstPage ? 1 : 1.05 }}
          whileTap={{ scale: disabled || isFirstPage ? 1 : 0.95 }}
          className="p-2 rounded-lg transition-all bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-active)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
          title="上一页"
          aria-label="上一页"
          aria-disabled={isFirstPage}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          )}
        </motion.button>

        <div className="flex items-center gap-1" role="list">
          {pageNumbers.map((pageNumber, index) => {
            if (pageNumber === -1) {
              return (
                <span
                  key={`dots-${index}`}
                  className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)]"
                  role="presentation"
                  aria-hidden="true"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </span>
              );
            }

            const isActive = pageNumber === currentPage;

            return (
              <motion.button
                key={pageNumber}
                onClick={() => handlePageClick(pageNumber)}
                whileHover={{ scale: disabled ? 1 : 1.05 }}
                whileTap={{ scale: disabled ? 1 : 0.95 }}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                  isActive
                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                role="listitem"
                aria-label={`第 ${pageNumber} 页`}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={disabled}
              >
                {pageNumber}
              </motion.button>
            );
          })}
        </div>

        <motion.button
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={isLastPage || disabled || isLoading}
          whileHover={{ scale: disabled || isLastPage ? 1 : 1.05 }}
          whileTap={{ scale: disabled || isLastPage ? 1 : 0.95 }}
          className="p-2 rounded-lg transition-all bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-active)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
          title="下一页"
          aria-label="下一页"
          aria-disabled={isLastPage}
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </motion.button>

        <motion.button
          onClick={() => handlePageClick(totalPages)}
          disabled={isLastPage || disabled || isLoading}
          whileHover={{ scale: disabled || isLastPage ? 1 : 1.05 }}
          whileTap={{ scale: disabled || isLastPage ? 1 : 0.95 }}
          className="hidden md:flex p-2 rounded-lg transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="末页"
          aria-label="跳转到最后一页"
          aria-disabled={isLastPage}
        >
          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
        </motion.button>
      </div>

      <div className="flex items-center gap-2 order-3">
        {hasError && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-all"
            aria-label="重试"
          >
            <AlertCircle className="w-3 h-3" />
            重试
          </button>
        )}

        {showJumpToPage && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">跳转到</span>
            <AnimatePresence mode="wait">
              {showJumpInput ? (
                <motion.form
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleJumpSubmit}
                  className="flex items-center gap-1"
                >
                  <input
                    ref={jumpInputRef}
                    type="number"
                    value={jumpValue}
                    onChange={(e) => setJumpValue(e.target.value)}
                    min={1}
                    max={totalPages}
                    placeholder={`1-${totalPages}`}
                    className="w-16 px-2 py-1 rounded-lg text-xs bg-[var(--input-bg)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                    style={{ appearance: 'textfield' }}
                    aria-label={`跳转到页码，范围 1 到 ${totalPages}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowJumpInput(false);
                        setJumpValue('');
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!jumpValue || safeParseInt(jumpValue, -1) < 1 || safeParseInt(jumpValue, -1) > totalPages}
                    className="px-2 py-1 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="确认跳转"
                  >
                    确定
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowJumpInput(false);
                      setJumpValue('');
                    }}
                    className="p-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                    aria-label="取消跳转"
                  >
                    ✕
                  </button>
                </motion.form>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleJumpInputToggle}
                  disabled={disabled || isLoading}
                  className="px-3 py-1 rounded-lg text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-active)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="打开跳转到页面对话框"
                >
                  跳转
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </nav>
  );
}

export { safeParseInt };
