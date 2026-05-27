export interface SourceConfig {
  id: string;
  name: string;
  type: 'social' | 'search' | 'news' | 'video';
  icon?: string;
  enabled: boolean;
  priority: number;
  description?: string;
}

export const SOURCE_CONFIG: SourceConfig[] = [
  // 社交媒体
  { 
    id: 'twitter', 
    name: 'Twitter', 
    type: 'social', 
    enabled: true, 
    priority: 1,
    description: 'Twitter 实时热点'
  },
  { 
    id: 'weibo', 
    name: '微博热搜', 
    type: 'social', 
    enabled: true, 
    priority: 2,
    description: '微博热搜话题'
  },
  { 
    id: 'weixin', 
    name: '微信公众号', 
    type: 'social', 
    enabled: true, 
    priority: 3,
    description: '微信公众号文章'
  },
  { 
    id: 'hackernews', 
    name: 'HackerNews', 
    type: 'social', 
    enabled: true, 
    priority: 4,
    description: '技术社区热点'
  },
  
  // 视频平台
  { 
    id: 'bilibili', 
    name: 'B站', 
    type: 'video', 
    enabled: true, 
    priority: 5,
    description: 'B站热门视频'
  },
  
  // 搜索引擎
  { 
    id: 'sogou', 
    name: '搜狗搜索', 
    type: 'search', 
    enabled: true, 
    priority: 6,
    description: '搜狗搜索结果'
  },
  { 
    id: 'bing', 
    name: 'Bing', 
    type: 'search', 
    enabled: true, 
    priority: 7,
    description: 'Bing搜索结果'
  },
  { 
    id: 'google', 
    name: 'Google', 
    type: 'search', 
    enabled: true, 
    priority: 8,
    description: 'Google搜索结果'
  },
  { 
    id: 'duckduckgo', 
    name: 'DuckDuckGo', 
    type: 'search', 
    enabled: true, 
    priority: 9,
    description: 'DuckDuckGo搜索结果'
  },
  { 
    id: 'baidu', 
    name: '百度', 
    type: 'search', 
    enabled: false, 
    priority: 10,
    description: '百度搜索结果'
  },
  
  // 短视频平台
  { 
    id: 'douyin', 
    name: '抖音', 
    type: 'video', 
    enabled: false, 
    priority: 11,
    description: '抖音热点'
  },
  { 
    id: 'xiaohongshu', 
    name: '小红书', 
    type: 'social', 
    enabled: false, 
    priority: 12,
    description: '小红书笔记'
  },
];

export const SOURCE_TYPE_MAP: Record<string, string> = {
  'social': '社交媒体',
  'search': '搜索引擎',
  'news': '新闻资讯',
  'video': '视频平台'
};

export function getEnabledSources(): SourceConfig[] {
  return SOURCE_CONFIG
    .filter(source => source.enabled)
    .sort((a, b) => a.priority - b.priority);
}

export function getAllSources(): SourceConfig[] {
  return [...SOURCE_CONFIG].sort((a, b) => a.priority - b.priority);
}

export function getSourceById(id: string): SourceConfig | undefined {
  return SOURCE_CONFIG.find(source => source.id === id);
}

export function getSourcesByType(type: SourceConfig['type']): SourceConfig[] {
  return SOURCE_CONFIG
    .filter(source => source.type === type)
    .sort((a, b) => a.priority - b.priority);
}
