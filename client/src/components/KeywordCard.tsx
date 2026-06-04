import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Keyword } from '../services/api';

interface KeywordCardProps {
  keyword: Keyword;
  index: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function KeywordCard({ keyword, index, onToggle, onDelete }: KeywordCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.02 }}
      className={cn(
        "group p-4 rounded-xl border transition-all",
        keyword.isActive
          ? "bg-[var(--bg-card)] border-blue-500/20 hover:border-blue-500/30"
          : "bg-[var(--bg-card)] border-[var(--border-subtle)] opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggle(keyword.id)}
            className={cn(
              "w-11 h-6 rounded-full transition-all relative",
              keyword.isActive ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700"
            )}
          >
            <span className={cn(
              "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all",
              keyword.isActive ? "left-6" : "left-1"
            )} />
          </button>
          
          <div>
            <span className={cn("font-medium", keyword.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>
              {keyword.text}
            </span>
            {keyword._count && keyword._count.hotspots > 0 && (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {keyword._count.hotspots} 条热点
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={() => onDelete(keyword.id)}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}