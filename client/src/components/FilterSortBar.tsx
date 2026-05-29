import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, Filter, X, Clock, Flame, TrendingUp, Target,
  ChevronDown, Check, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { KeywordWithStats } from '../services/api';
import { useSourceOptions } from '../hooks/useSourcesConfig';
import { defaultFilterState, type FilterState } from '../constants/filters';
import { countActiveFilters, isActiveFilter } from '../utils/filterUtils';

type Keyword = KeywordWithStats;

interface FilterSortBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  keywords: Keyword[];
}

const SORT_OPTIONS = [
  { value: 'createdAt', label: '最新发现', icon: Clock },
  { value: 'publishedAt', label: '最新发布', icon: Clock },
  { value: 'importance', label: '重要程度', icon: Flame },
  { value: 'relevance', label: '相关性', icon: Target },
  { value: 'hot', label: '热度综合', icon: TrendingUp },
];

const IMPORTANCE_OPTIONS = [
  { value: '', label: '全部等级' },
  { value: 'urgent', label: '🔴 紧急', color: 'text-red-400' },
  { value: 'high', label: '🟠 高', color: 'text-orange-400' },
  { value: 'medium', label: '🟡 中', color: 'text-amber-400' },
  { value: 'low', label: '🟢 低', color: 'text-emerald-400' },
];

const TIME_RANGE_OPTIONS = [
  { value: '', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
];

const REAL_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'true', label: '✅ 真实' },
  { value: 'false', label: '⚠️ 疑似虚假' },
];

const QUICK_FILTER_PRESETS: Array<{
  label: string;
  importance?: string;
  timeRange?: string;
}> = [
  { label: '仅看紧急', importance: 'urgent' },
  { label: '今天新发现', timeRange: 'today' },
];

function Dropdown({ 
  label, 
  value, 
  options, 
  onChange 
}: { 
  label: string; 
  value: string; 
  options: { value: string; label: string; color?: string; count?: number }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const isActive = value !== '';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap min-w-[100px]",
          isActive
            ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
            : "bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-slate-300"
        )}
      >
        <span>{isActive ? selected?.label : label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-[#0d0d20]/98 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left",
                    value === option.value
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {value === option.value && <Check className="w-3 h-3 shrink-0" />}
                  <span className={cn(option.color)}>{option.label}</span>
                  {option.count !== undefined && option.count > 0 && (
                    <span className="ml-auto text-[10px] text-slate-500">
                      {option.count}
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
      {label}
      <button onClick={onRemove} className="hover:text-blue-300">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function FilterSortBar({ filters, onChange, keywords }: FilterSortBarProps) {
  const [showFilters, setShowFilters] = useState(true);
  const { options: dynamicSourceOptions } = useSourceOptions();

  const activeFilterCount = useMemo(() => 
    countActiveFilters(filters), [filters]);

  const hasActiveFilters = useMemo(() => 
    isActiveFilter(filters), [filters]);

  const update = (key: keyof FilterState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const resetFilters = () => {
    onChange({
      ...defaultFilterState,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      source: '',
      sourceRecordId: '',
      importance: '',
      keywordId: '',
      timeRange: '',
      isReal: ''
    });
  };

  const applyQuickFilter = (preset: typeof QUICK_FILTER_PRESETS[number]) => {
    if ('importance' in preset && preset.importance) {
      update('importance', preset.importance);
    } else if ('timeRange' in preset && preset.timeRange) {
      update('timeRange', preset.timeRange);
    }
  };

  const keywordOptions = useMemo(() => [
    { value: '', label: '全部关键词', count: undefined },
    ...keywords.filter(k => k.isActive).map(k => ({ 
      value: k.id, 
      label: k.text,
      count: k._count?.hotspots ?? 0
    })),
  ], [keywords]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl border border-white/5 p-1">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 ml-2" />
          {SORT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => update('sortBy', opt.value)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all",
                  filters.sortBy === opt.value
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Icon className="w-3 h-3" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {activeFilterCount > 0 && !showFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.source && (
              <FilterTag
                label={dynamicSourceOptions.find(o => o.value === filters.source)?.label || filters.source}
                onRemove={() => update('source', '')}
              />
            )}
            {filters.importance && (
              <FilterTag
                label={IMPORTANCE_OPTIONS.find(o => o.value === filters.importance)?.label || filters.importance}
                onRemove={() => update('importance', '')}
              />
            )}
            {filters.keywordId && (
              <FilterTag
                label={keywordOptions.find(o => o.value === filters.keywordId)?.label || '关键词'}
                onRemove={() => update('keywordId', '')}
              />
            )}
            {filters.timeRange && (
              <FilterTag
                label={TIME_RANGE_OPTIONS.find(o => o.value === filters.timeRange)?.label || '时间'}
                onRemove={() => update('timeRange', '')}
              />
            )}
            {filters.isReal && (
              <FilterTag
                label={REAL_OPTIONS.find(o => o.value === filters.isReal)?.label || '真实性'}
                onRemove={() => update('isReal', '')}
              />
            )}
          </div>
        )}

        {QUICK_FILTER_PRESETS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => applyQuickFilter(preset)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              hasActiveFilters
                ? "bg-white/5 text-slate-400 border border-white/10 hover:border-white/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20"
            )}
          >
            {preset.label}
          </button>
        ))}

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            showFilters || activeFilterCount > 0
              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
              : "bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-slate-300"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>筛选</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-300 text-xs">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-all"
            title="重置筛选条件（保留排序方式）"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <Dropdown label="来源类型" value={filters.source} options={dynamicSourceOptions} onChange={(v) => update('source', v)} />
              <Dropdown label="重要程度" value={filters.importance} options={IMPORTANCE_OPTIONS} onChange={(v) => update('importance', v)} />
              <Dropdown label="关键词" value={filters.keywordId} options={keywordOptions} onChange={(v) => update('keywordId', v)} />
              <Dropdown label="时间" value={filters.timeRange} options={TIME_RANGE_OPTIONS} onChange={(v) => update('timeRange', v)} />
              <Dropdown label="真实性" value={filters.isReal} options={REAL_OPTIONS} onChange={(v) => update('isReal', v)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
