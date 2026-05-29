import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Edit2, Trash2, Download, Upload, BarChart3,
  ChevronLeft, ChevronRight, X, Check, Eye,
  Globe, Twitter, MessageSquare, Activity, Settings
} from 'lucide-react';
import { cn } from '../lib/utils';
import { sourcesApi, type Source as ApiSource } from '../services/sources';
import { useSourcesFilters } from '../hooks';
import { useSourceOptions } from '../hooks/useSourcesConfig';
import ConfirmDialog from './ConfirmDialog';
import {
  SOURCE_STATUS_OPTIONS
} from '@hot-monitor/types';
import { logError } from '../utils/errorHandler';

type Source = ApiSource;
type SourceStats = { totalRequests: number; successCount: number; errorCount: number };

const PAGE_SIZE = 10;

interface SourcesManagerProps {
  onSourceSelect?: (source: Source) => void;
}

export default function SourcesManager({ onSourceSelect }: SourcesManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const {
    filters,
    debouncedFilters,
    page,
    updateFilters,
    resetFilters,
    setSearch,
    goToNextPage,
    goToPrevPage
  } = useSourcesFilters();
  
  const { options: sourceTypeOptions } = useSourceOptions();

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        type: debouncedFilters.type || undefined,
        category: debouncedFilters.category || undefined,
        status: debouncedFilters.status || undefined,
        search: debouncedFilters.search || undefined
      };
      const data = await sourcesApi.getAll(params);
      setSources(data.data);
      setStats(data.stats);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      logError(error, 'LoadSources');
      showToast('加载来源失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedFilters.type, debouncedFilters.category, debouncedFilters.status, debouncedFilters.search, showToast]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleCreate = useCallback(() => {
    setEditingSource(null);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((source: Source) => {
    setEditingSource(source);
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const previousSources = sources;
    
    setConfirmDialog({
      isOpen: true,
      title: '删除来源',
      message: '确定要删除这个来源吗？此操作无法撤销。',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        try {
          await sourcesApi.delete(id);
          setSources(prev => prev.filter(s => s.id !== id));
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
          showToast('来源已删除', 'success');
        } catch (error) {
          setSources(previousSources);
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          console.error('删除来源失败:', error);
          showToast('删除失败', 'error');
        }
      }
    });
  }, [showToast]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await sourcesApi.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sources-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    } catch (error) {
      logError(error, 'ExportSources');
      showToast('导出失败', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [showToast]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!Array.isArray(data)) {
        showToast('导入文件格式错误：期望JSON数组', 'error');
        return;
      }

      const result = await sourcesApi.import(data);
      setImportResult(result);
      
      if (result.failed === 0) {
        showToast(`成功导入 ${result.success} 个来源`, 'success');
        await loadSources();
      } else {
        showToast(`导入完成：成功 ${result.success}，失败 ${result.failed}`, 'error');
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        showToast('JSON格式错误', 'error');
      } else {
        showToast('导入失败', 'error');
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [showToast, loadSources]);

  const handleViewDetail = useCallback((source: Source) => {
    setSelectedSource(source);
    setShowDetailModal(true);
  }, []);

  const handleSelectSource = useCallback((source: Source) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(source.id)) {
        next.delete(source.id);
      } else {
        next.add(source.id);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) {
      showToast('请先选择要删除的来源', 'error');
      return;
    }

    const idsToDelete = new Set(selectedIds);
    const count = idsToDelete.size;

    setConfirmDialog({
      isOpen: true,
      title: '批量删除来源',
      message: `确定要删除选中的 ${count} 个来源吗？此操作无法撤销。`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isLoading: true }));
        try {
          await sourcesApi.batchDelete(Array.from(idsToDelete));
          setSelectedIds(new Set());
          setSources(prev => prev.filter(s => !idsToDelete.has(s.id)));
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
          showToast('批量删除成功', 'success');
        } catch (error) {
          logError(error, 'BatchDeleteSources');
          setConfirmDialog(prev => ({ ...prev, isLoading: false }));
          showToast('批量删除失败', 'error');
        }
      }
    });
  }, [selectedIds, showToast]);

  const statusConfig = useMemo(() => ({
    active: { label: '启用', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    paused: { label: '暂停', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    error: { label: '错误', className: 'text-red-400 bg-red-500/10 border-red-500/20' }
  }), []);

  const typeIcons = useMemo(() => ({
    twitter: <Twitter className="w-4 h-4" />,
    weibo: <MessageSquare className="w-4 h-4" />,
    bing: <Globe className="w-4 h-4" />,
    google: <Globe className="w-4 h-4" />,
    default: <Activity className="w-4 h-4" />
  }), []);

  const getTypeIcon = useCallback((type: string) => {
    return typeIcons[type as keyof typeof typeIcons] || typeIcons.default;
  }, [typeIcons]);

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            来源管理
          </h2>
          <p className="text-slate-500 text-sm mt-1">管理系统数据来源</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            导出
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            id="import-file"
          />
          <label
            htmlFor="import-file"
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isImporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            导入
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              批量删除 ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            新增来源
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-slate-500 text-sm mb-1">总请求数</div>
            <div className="text-2xl font-bold text-white">{stats.totalRequests.toLocaleString()}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-slate-500 text-sm mb-1">成功次数</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.successCount.toLocaleString()}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-slate-500 text-sm mb-1">错误次数</div>
            <div className="text-2xl font-bold text-red-400">{stats.errorCount.toLocaleString()}</div>
          </div>
        </div>
      )}

      {importResult && (
        <div className={cn(
          "p-4 rounded-xl border",
          importResult.failed === 0 
            ? "bg-emerald-500/10 border-emerald-500/20" 
            : "bg-amber-500/10 border-amber-500/20"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">
                导入完成
              </div>
              <div className="text-sm text-slate-400 mt-1">
                成功 {importResult.success}，失败 {importResult.failed}
              </div>
              {importResult.errors.length > 0 && (
                <div className="text-xs text-red-400 mt-2">
                  {importResult.errors.slice(0, 3).join('; ')}
                  {importResult.errors.length > 3 && `...等 ${importResult.errors.length} 条错误`}
                </div>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              placeholder="搜索来源..."
              value={filters.search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => updateFilters({ type: e.target.value })}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">全部类型</option>
            {sourceTypeOptions.filter(o => o.value !== '').map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value })}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">全部状态</option>
            {SOURCE_STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>
                {status === 'active' ? '启用' : status === 'paused' ? '暂停' : '错误'}
              </option>
            ))}
          </select>
          <button
            onClick={resetFilters}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
          >
            重置筛选
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-white/10">
          <Settings className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">暂无来源数据</p>
          <p className="text-sm text-slate-600 mt-1">点击上方按钮添加第一个来源</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source, index) => (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(source.id)}
                    onChange={() => handleSelectSource(source)}
                    className="w-5 h-5 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        {getTypeIcon(source.type)}
                      </div>
                      <div>
                        <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors">
                          {source.name}
                        </h3>
                        <p className="text-xs text-slate-500">{source.type} • {source.category || '未分类'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn(
                      "px-2 py-1 rounded-md border font-medium",
                      statusConfig[source.status]?.className
                    )}>
                      {statusConfig[source.status]?.label}
                    </span>
                    {source.hotspotCount !== undefined && (
                      <span className="px-2 py-1 rounded-md bg-white/5 text-slate-400">
                        {source.hotspotCount} 条热点
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-md bg-white/5 text-slate-400">
                      {source.totalRequests.toLocaleString()} 请求
                    </span>
                    <span className="px-2 py-1 rounded-md bg-white/5 text-slate-400">
                      成功率 {source.totalRequests > 0
                        ? ((source.successCount / source.totalRequests) * 100).toFixed(1)
                        : 0}%
                    </span>
                  </div>

                  {source.description && (
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2">{source.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleViewDetail(source)}
                    className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {onSourceSelect && (
                    <button
                      onClick={() => onSourceSelect(source)}
                      className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                      title="选择"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(source)}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={goToPrevPage}
            disabled={page <= 1}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-500">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={goToNextPage}
            disabled={page >= totalPages}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

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

      <AnimatePresence>
        {showModal && (
          <SourceModal
            source={editingSource}
            onClose={() => setShowModal(false)}
            onSave={() => {
              setShowModal(false);
              loadSources();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailModal && selectedSource && (
          <SourceDetailModal
            source={selectedSource}
            getTypeIcon={getTypeIcon}
            onClose={() => {
              setShowDetailModal(false);
              setSelectedSource(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface SourceModalProps {
  source: Source | null;
  onClose: () => void;
  onSave: () => void;
}

function SourceModal({ source, onClose, onSave }: SourceModalProps) {
  const { options: sourceTypeOptions } = useSourceOptions();
  
  const [formData, setFormData] = useState({
    name: source?.name || '',
    type: source?.type || 'twitter',
    dataSourceId: source?.dataSourceId || source?.type || 'twitter',
    category: source?.category || '',
    status: source?.status || 'active',
    description: source?.description || '',
    config: source?.config || null,
    priority: source?.priority || 0,
    isPublic: source?.isPublic ?? true,
    allowedRoles: source?.allowedRoles || null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configString, setConfigString] = useState(() => {
    if (source?.config) {
      return typeof source.config === 'string' ? source.config : JSON.stringify(source.config, null, 2);
    }
    return '';
  });
  const [rolesInput, setRolesInput] = useState(() => {
    if (source?.allowedRoles) {
      return String(source.allowedRoles);
    }
    return '';
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const parsedRoles = rolesInput.trim() 
        ? rolesInput.split(',').map((r: string) => r.trim()).filter((r: string) => r.length > 0)
        : null;
      
      const submitData: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        dataSourceId: formData.dataSourceId,
        category: formData.category || null,
        status: formData.status,
        description: formData.description || null,
        priority: formData.priority,
        isPublic: formData.isPublic,
        config: configString.trim() ? JSON.parse(configString) : null,
        allowedRoles: parsedRoles
      };
      
      if (source) {
        await sourcesApi.update(source.id, submitData as Partial<ApiSource>);
      } else {
        await sourcesApi.create(submitData as Parameters<typeof sourcesApi.create>[0]);
      }
      onSave();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('配置JSON格式错误，请检查JSON语法');
      } else {
        setError(err instanceof Error ? err.message : '操作失败');
      }
      setIsSubmitting(false);
      return;
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-[#0a0a1a]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl z-50 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">
            {source ? '编辑来源' : '新增来源'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">来源名称 *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              placeholder="输入来源名称"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">来源类型 *</label>
              <select
                required
                value={formData.type}
                onChange={(e) => {
                  setFormData({ ...formData, type: e.target.value });
                  if (!source) {
                    setFormData(prev => ({ ...prev, dataSourceId: e.target.value }));
                  }
                }}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              >
                {sourceTypeOptions.filter(o => o.value !== '').map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">数据源ID</label>
              <input
                type="text"
                value={formData.dataSourceId}
                onChange={(e) => setFormData({ ...formData, dataSourceId: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                placeholder="运行时数据源标识符"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">分类</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                placeholder="输入分类名称"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">状态</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'paused' | 'error' })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              >
                {SOURCE_STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>
                    {status === 'active' ? '启用' : status === 'paused' ? '暂停' : '错误'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">描述</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="输入来源描述"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">配置JSON</label>
            <textarea
              rows={4}
              value={configString}
              onChange={(e) => setConfigString(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 resize-none font-mono text-sm"
              placeholder='{"apiKey": "xxx", "limit": 100}'
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">允许访问的角色</label>
            <input
              type="text"
              value={rolesInput}
              onChange={(e) => setRolesInput(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              placeholder="admin, editor, viewer (逗号分隔)"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/50"
            />
            <label htmlFor="isPublic" className="text-sm text-slate-400">
              公开来源（所有用户可见）
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}

function SourceDetailModal({ source, onClose, getTypeIcon }: { source: Source; onClose: () => void; getTypeIcon: (type: string) => React.ReactNode }) {
  const successRate = source.totalRequests > 0 
    ? ((source.successCount / source.totalRequests) * 100).toFixed(1) 
    : '0';

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[#0a0a1a]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl z-50 p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">来源详情</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              {getTypeIcon(source.type)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{source.name}</h2>
              <p className="text-sm text-slate-500">{source.type} • {source.category || '未分类'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">状态</div>
              <div className={cn(
                "font-medium",
                source.status === 'active' ? 'text-emerald-400' : 
                source.status === 'paused' ? 'text-amber-400' : 'text-red-400'
              )}>
                {source.status === 'active' ? '启用' : source.status === 'paused' ? '暂停' : '错误'}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">数据源ID</div>
              <div className="font-mono text-white">{source.dataSourceId || source.type}</div>
            </div>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">热点数量</div>
              <div className="font-medium text-white">{source.hotspotCount ?? 0}</div>
            </div>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">成功率</div>
              <div className="font-medium text-emerald-400">{successRate}%</div>
            </div>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">总请求数</div>
              <div className="font-medium text-white">{source.totalRequests.toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-1">错误次数</div>
              <div className="font-medium text-red-400">{source.errorCount.toLocaleString()}</div>
            </div>
          </div>

          {source.description && (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-2">描述</div>
              <div className="text-white">{source.description}</div>
            </div>
          )}

          {source.config && (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-2">配置</div>
              <pre className="text-xs text-slate-400 overflow-x-auto">
                {JSON.stringify(source.config, null, 2)}
              </pre>
            </div>
          )}

          {source.allowedRoles && (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-sm text-slate-500 mb-2">允许访问的角色</div>
              <div className="flex flex-wrap gap-2">
                {source.allowedRoles.split(',').map((role, i) => (
                  <span key={i} className="px-2 py-1 rounded-md bg-white/5 text-slate-400 text-sm">
                    {role.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="text-sm text-slate-500 mb-2">访问权限</div>
            <div className="text-white">{source.isPublic ? '公开' : '私有'}</div>
          </div>

          <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="text-sm text-slate-500 mb-2">创建时间</div>
            <div className="text-white">{new Date(source.createdAt).toLocaleString('zh-CN')}</div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </>
  );
}
