
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, ChevronDown, ChevronUp, ThermometerSun, Zap, Repeat2, MessageCircle, Quote, Eye, Clock, Activity, Target, FileText, Shield, ShieldAlert, User } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Hotspot } from '../services/api';
import { relativeTime, formatDateTime } from '../utils/relativeTime';

interface HotspotCardProps {
  hotspot: Hotspot;
  index: number;
  expandedReasons: Set<string>;
  expandedContents: Set<string>;
  onToggleReason: (id: string) => void;
  onToggleContent: (id: string) => void;
}

function calcHeatScore(h: Hotspot): number {
  const likes = h.likeCount ?? 0;
  const retweets = h.retweetCount ?? 0;
  const replies = h.replyCount ?? 0;
  const comments = h.commentCount ?? 0;
  const quotes = h.quoteCount ?? 0;
  const views = h.viewCount ?? 0;
  const raw = likes * 2 + retweets * 3 + replies * 1.5 + comments * 1.5 + quotes * 2 + views / 100;
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}

function getHeatLevel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: '爆', color: 'text-red-500' };
  if (score >= 60) return { label: '热', color: 'text-orange-500' };
  if (score >= 40) return { label: '温', color: 'text-amber-500' };
  if (score >= 20) return { label: '凉', color: 'text-blue-500' };
  return { label: '冷', color: 'text-slate-400' };
}

function getImportanceIcon(importance: string) {
  switch (importance) {
    case 'urgent': return <ShieldAlert className="w-4 h-4" />;
    case 'high': return <Zap className="w-4 h-4" />;
    case 'medium': return <Activity className="w-4 h-4" />;
    default: return <Activity className="w-4 h-4" />;
  }
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'twitter': return <Zap className="w-4 h-4" />;
    case 'bilibili': return <Eye className="w-4 h-4" />;
    case 'weibo': return <Activity className="w-4 h-4" />;
    case 'sogou': return <Target className="w-4 h-4" />;
    case 'hackernews': return <Zap className="w-4 h-4" />;
    default: return <Eye className="w-4 h-4" />;
  }
}

function getSourceLabel(source: string) {
  const labels: Record<string, string> = {
    twitter: 'Twitter',
    bing: 'Bing',
    google: 'Google',
    sogou: '搜狗',
    bilibili: 'Bilibili',
    weibo: '微博热搜',
    hackernews: 'HackerNews',
    duckduckgo: 'DuckDuckGo'
  };
  return labels[source] || source;
}

function getImportanceBgClass(importance: string) {
  switch (importance) {
    case 'urgent': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20';
    case 'high': return 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20';
    case 'medium': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';
    default: return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  }
}

export default function HotspotCard({ 
  hotspot, 
  index, 
  expandedReasons, 
  expandedContents, 
  onToggleReason, 
  onToggleContent 
}: HotspotCardProps) {
  const heatScore = calcHeatScore(hotspot);
  const heat = getHeatLevel(heatScore);

  return (
    <motion.div
      key={hotspot.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group p-5 rounded-2xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center border", getImportanceBgClass(hotspot.importance))}>
              {getImportanceIcon(hotspot.importance)}
              <span className="ml-1">{hotspot.importance}</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              {getSourceIcon(hotspot.source)}
              {getSourceLabel(hotspot.source)}
            </span>
            {hotspot.keyword && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {hotspot.keyword.text}
              </span>
            )}
            {!hotspot.isReal && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                <ShieldAlert className="w-3 h-3" />
                可疑
              </span>
            )}
            {hotspot.isReal && hotspot.relevance >= 80 && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Shield className="w-3 h-3" />
                可信
              </span>
            )}
            {hotspot.keywordMentioned === true && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                <Target className="w-3 h-3" />
                直接提及
              </span>
            )}
            {hotspot.keywordMentioned === false && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border border-yellow-500/20">
                <Target className="w-3 h-3" />
                间接相关
              </span>
            )}
            <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-medium", heat.color)}>
              <ThermometerSun className="w-3 h-3" />
              {heat.label} {heatScore}
            </span>
          </div>
          
          <h3 className="font-medium text-[var(--text-primary)] mb-2 line-clamp-2 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
            {hotspot.title}
          </h3>
          
          {hotspot.summary && (
            <div className="mb-3">
              <span className="text-[10px] text-blue-600 dark:text-blue-400/60 font-medium mr-1.5">AI 摘要</span>
              <span className="text-sm text-[var(--text-secondary)]">{hotspot.summary}</span>
            </div>
          )}

          {hotspot.authorName && (
            <div className="flex items-center gap-2 mb-3">
              {hotspot.authorAvatar ? (
                <img src={hotspot.authorAvatar} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span className="text-xs text-[var(--text-secondary)]">
                {hotspot.authorName}
                {hotspot.authorUsername && <span className="text-[var(--text-muted)] ml-1">@{hotspot.authorUsername}</span>}
              </span>
              {hotspot.authorVerified && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">✓ 认证</span>
              )}
              {hotspot.authorFollowers != null && hotspot.authorFollowers > 0 && (
                <span className="text-[10px] text-[var(--text-muted)]">{hotspot.authorFollowers.toLocaleString()} 粉丝</span>
              )}
            </div>
          )}
          
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] mb-2">
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              相关性 {hotspot.relevance}%
            </span>
            {hotspot.likeCount != null && hotspot.likeCount > 0 && (
              <span className="flex items-center gap-1" title="点赞">
                <Zap className="w-3.5 h-3.5" />
                {hotspot.likeCount.toLocaleString()}
              </span>
            )}
            {hotspot.retweetCount != null && hotspot.retweetCount > 0 && (
              <span className="flex items-center gap-1" title="转发">
                <Repeat2 className="w-3.5 h-3.5" />
                {hotspot.retweetCount.toLocaleString()}
              </span>
            )}
            {hotspot.replyCount != null && hotspot.replyCount > 0 && (
              <span className="flex items-center gap-1" title="回复">
                <MessageCircle className="w-3.5 h-3.5" />
                {hotspot.replyCount.toLocaleString()}
              </span>
            )}
            {hotspot.commentCount != null && hotspot.commentCount > 0 && (
              <span className="flex items-center gap-1" title="评论">
                <MessageCircle className="w-3.5 h-3.5" />
                {hotspot.commentCount.toLocaleString()}
              </span>
            )}
            {hotspot.quoteCount != null && hotspot.quoteCount > 0 && (
              <span className="flex items-center gap-1" title="引用">
                <Quote className="w-3.5 h-3.5" />
                {hotspot.quoteCount.toLocaleString()}
              </span>
            )}
            {hotspot.viewCount != null && hotspot.viewCount > 0 && (
              <span className="flex items-center gap-1" title="浏览量">
                <Eye className="w-3.5 h-3.5" />
                {hotspot.viewCount.toLocaleString()}
              </span>
            )}
            {hotspot.danmakuCount != null && hotspot.danmakuCount > 0 && (
              <span className="flex items-center gap-1" title="弹幕">
                💬 {hotspot.danmakuCount.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
            {hotspot.publishedAt && (
              <span className="flex items-center gap-1" title={`发布于 ${formatDateTime(hotspot.publishedAt)}`}>
                <Clock className="w-3 h-3" />
                发布 {relativeTime(hotspot.publishedAt)}
              </span>
            )}
            <span className="flex items-center gap-1" title={`抓取于 ${formatDateTime(hotspot.createdAt)}`}>
              <Activity className="w-3 h-3" />
              抓取 {relativeTime(hotspot.createdAt)}
            </span>
          </div>

          {hotspot.relevanceReason && (
            <div className="mt-2">
              <button
                onClick={() => onToggleReason(hotspot.id)}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400/70 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                {expandedReasons.has(hotspot.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                AI 分析理由
              </button>
              <AnimatePresence>
                {expandedReasons.has(hotspot.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="text-xs text-[var(--text-secondary)] mt-1 pl-4 border-l-2 border-blue-500/20">
                      {hotspot.relevanceReason}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {hotspot.content && hotspot.content !== hotspot.summary && (
            <div className="mt-2">
              <button
                onClick={() => onToggleContent(hotspot.id)}
                className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {expandedContents.has(hotspot.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <FileText className="w-3 h-3" />
                原始内容
              </button>
              <AnimatePresence>
                {expandedContents.has(hotspot.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="text-xs text-[var(--text-secondary)] mt-1 pl-4 border-l-2 border-[var(--border-subtle)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {hotspot.content}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        
        <a
          href={hotspot.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-blue-500/20 text-[var(--text-muted)] hover:text-blue-500 dark:hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  );
}