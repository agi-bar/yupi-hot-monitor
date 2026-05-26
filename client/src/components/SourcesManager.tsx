import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Edit2, Trash2, Download, BarChart3,
  ChevronLeft, ChevronRight, X, Check,
  Globe, Twitter, MessageSquare, Activity, Settings
} from 'lucide-react';
import { cn } from '../lib/utils';
import { sourcesApi, type Source, type SourceStats } from '../services/sources';

interface SourcesManagerProps {
  onSourceSelect?: (source: Source) => void;
}

export default function SourcesManager({ onSourceSelect }: SourcesManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    status: '',
    search: ''
  });

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: 10,
        ...filters
      };
      const data = await sourcesApi.getAll(params);
      setSources(data.data);
      setStats(data.stats);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      showToast('加载来源失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filters]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = () => {
    setEditingSource(null);
    setShowModal(true);
  };

  const handleEdit = (source: Source) => {
    setEditingSource(source);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个来源吗？')) return;

    try {
      await sourcesApi.delete(id);
      showToast('来源已删除', 'success');
      loadSources();
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const handleExport = async () => {
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
    } catch {
      showToast('导出失败', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'paused': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'error': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'twitter': return <Twitter className="w-4 h-4" />;
      case 'weibo': return <MessageSquare className="w-4 h-4" />;
      case 'bing':
      case 'google': return <Globe className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            新增来源
          </button>
        </div>
      </div>

      {/* Stats Cards */}
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

      {/* Filters */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              placeholder="搜索来源..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">全部类型</option>
            <option value="twitter">Twitter</option>
            <option value="weibo">微博</option>
            <option value="bing">Bing</option>
            <option value="google">Google</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="paused">暂停</option>
            <option value="error">错误</option>
          </select>
          <button
            onClick={() => setFilters({ type: '', category: '', status: '', search: '' })}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
          >
            重置筛选
          </button>
        </div>
      </div>

      {/* Sources List */}
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

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn(
                      "px-2 py-1 rounded-md border font-medium",
                      getStatusColor(source.status)
                    )}>
                      {source.status === 'active' ? '启用' : source.status === 'paused' ? '暂停' : '错误'}
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
                  {onSourceSelect && (
                    <button
                      onClick={() => onSourceSelect(source)}
                      className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                      title="查看详情"
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-500">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Modal */}
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
    </div>
  );
}

interface SourceModalProps {
  source: Source | null;
  onClose: () => void;
  onSave: () => void;
}

function SourceModal({ source, onClose, onSave }: SourceModalProps) {
  const [formData, setFormData] = useState({
    name: source?.name || '',
    type: source?.type || 'twitter',
    category: source?.category || '',
    status: source?.status || 'active',
    description: source?.description || '',
    priority: source?.priority || 0,
    isPublic: source?.isPublic ?? true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (source) {
        await sourcesApi.update(source.id, formData);
      } else {
        await sourcesApi.create(formData);
      }
      onSave();
    } catch (error) {
      alert(error instanceof Error ? error.message : '操作失败');
    } finally {
      setIsSubmitting(false);
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
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="twitter">Twitter</option>
                <option value="weibo">微博</option>
                <option value="bing">Bing</option>
                <option value="google">Google</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">状态</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'paused' | 'error' })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="active">启用</option>
                <option value="paused">暂停</option>
                <option value="error">错误</option>
              </select>
            </div>
          </div>

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
            <label className="block text-sm font-medium text-slate-400 mb-2">描述</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="输入来源描述"
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
