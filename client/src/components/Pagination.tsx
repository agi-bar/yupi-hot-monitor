import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">每页显示</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500/50 transition-colors"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size} className="bg-[#0a0a1a]">
              {size} 条
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          共 {total} 条数据
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className={cn(
            "p-2 rounded-xl border transition-all",
            currentPage <= 1
              ? "bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-40"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {pageNumbers.map((page, index) => (
            typeof page === 'number' ? (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-medium transition-all",
                  currentPage === page
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-500 hover:text-white hover:bg-white/5"
                )}
              >
                {page}
              </button>
            ) : (
              <span key={`ellipsis-${index}`} className="w-8 h-8 flex items-center justify-center text-slate-600">
                {page}
              </span>
            )
          ))}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className={cn(
            "p-2 rounded-xl border transition-all",
            currentPage >= totalPages
              ? "bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-40"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <span className="text-xs text-slate-600 ml-2">
          第 {currentPage} / {totalPages} 页
        </span>
      </div>
    </div>
  );
}
