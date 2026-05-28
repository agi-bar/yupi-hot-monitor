import React from 'react';
import { Twitter, Eye, MessageCircle, Search, Zap, Globe, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const API_BASE = '/api';

export interface SourceConfig {
  id: string;
  name: string;
  type: 'social' | 'search' | 'news' | 'video';
  icon?: string;
  enabled: boolean;
  priority: number;
  description?: string;
}

export interface SourceTypeConfig {
  social: string;
  search: string;
  news: string;
  video: string;
}

export interface SourceConfigResponse {
  success: boolean;
  data: SourceConfig[];
  meta?: {
    total: number;
    types: SourceTypeConfig;
  };
}

export interface SourceDisplayConfig {
  id: string;
  name: string;
  icon: LucideIcon;
}

export const SOURCE_DISPLAY_CONFIG: SourceDisplayConfig[] = [
  { id: 'twitter', name: 'Twitter', icon: Twitter },
  { id: 'weibo', name: '微博热搜', icon: Activity },
  { id: 'weixin', name: '微信公众号', icon: MessageCircle },
  { id: 'hackernews', name: 'HackerNews', icon: Zap },
  { id: 'bilibili', name: 'B站', icon: Eye },
  { id: 'sogou', name: '搜狗', icon: Search },
  { id: 'bing', name: 'Bing', icon: Globe },
  { id: 'google', name: 'Google', icon: Globe },
  { id: 'duckduckgo', name: 'DuckDuckGo', icon: Globe },
  { id: 'baidu', name: '百度', icon: Globe },
  { id: 'douyin', name: '抖音', icon: Activity },
  { id: 'xiaohongshu', name: '小红书', icon: MessageCircle },
];

export function getSourceLabel(sourceId: string): string {
  const config = SOURCE_DISPLAY_CONFIG.find(s => s.id === sourceId);
  return config?.name || sourceId;
}

export function getSourceIcon(sourceId: string, className: string = 'w-4 h-4'): React.ReactElement {
  const config = SOURCE_DISPLAY_CONFIG.find(s => s.id === sourceId);
  const Icon = config?.icon || Globe;
  return React.createElement(Icon, { className });
}

export async function fetchSourcesConfig(enabled?: boolean): Promise<SourceConfig[]> {
  const endpoint = enabled ? '/sources/config?enabled=true' : '/sources/config';
  const response = await fetch(`${API_BASE}${endpoint}`);

  if (!response.ok) {
    let errorMessage = `获取来源配置失败 (${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  const result: SourceConfigResponse = await response.json();
  return result.data;
}

export async function fetchSourceTypes(): Promise<SourceTypeConfig> {
  const response = await fetch(`${API_BASE}/sources/types`);

  if (!response.ok) {
    let errorMessage = `获取来源类型失败 (${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result.data;
}

export async function fetchSourcesByType(type: string): Promise<SourceConfig[]> {
  const response = await fetch(`${API_BASE}/sources/config?type=${type}`);

  if (!response.ok) {
    let errorMessage = `按类型获取来源失败 (${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  const result: SourceConfigResponse = await response.json();
  return result.data;
}
