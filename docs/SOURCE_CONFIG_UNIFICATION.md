# 来源配置统一方案

## 当前问题

### 前端SOURCE_OPTIONS（FilterSortBar.tsx）
```typescript
const SOURCE_OPTIONS = [
  { value: 'twitter', label: 'Twitter' },
  { value: 'bing', label: 'Bing' },
  { value: 'google', label: 'Google' },
  { value: 'sogou', label: '搜狗' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'weibo', label: '微博热搜' },
  { value: 'weixin', label: '微信公众号' },
  { value: 'hackernews', label: 'HackerNews' },
  { value: 'duckduckgo', label: 'DuckDuckGo' },
];
```

### 后端DataSourceManager
```typescript
private registerDefaultSources(): void {
  const baidu = new BaiduDataSource();
  this.sources.set('baidu', baidu);
  
  const douyin = new DouyinDataSource();
  this.sources.set('douyin', douyin);
  
  const videoSource = new VideoSourceDataSource();
  this.sources.set('video-source', videoSource);
  
  const xiaohongshu = new XiaohongshuDataSource();
  this.sources.set('xiaohongshu', xiaohongshu);
}
```

### 问题总结

| 来源 | 前端SOURCE_OPTIONS | 后端DataSourceManager | 是否匹配 |
|------|-------------------|---------------------|---------|
| baidu | ❌ 不在列表 | ✅ 支持 | 不匹配 |
| bing | ✅ 支持 | ❌ 不支持 | 不匹配 |
| google | ✅ 支持 | ❌ 不支持 | 不匹配 |
| sogou | ✅ 支持 | ❌ 不支持 | 不匹配 |
| bilibili | ✅ 支持 | ❌ 不支持 | 不匹配 |
| weibo | ✅ 支持 | ❌ 不支持 | 不匹配 |
| weixin | ✅ 支持 | ❌ 不支持 | 不匹配 |
| hackernews | ✅ 支持 | ❌ 不支持 | 不匹配 |
| duckduckgo | ✅ 支持 | ❌ 不支持 | 不匹配 |
| douyin | ❌ 不在列表 | ✅ 支持 | 不匹配 |
| xiaohongshu | ❌ 不在列表 | ✅ 支持 | 不匹配 |

---

## 解决方案

### 方案一：统一来源配置（推荐）

在后端创建统一的来源配置，前端动态获取

#### 1. 创建来源配置API

```typescript
// 后端新增接口 GET /api/sources/config
interface SourceConfig {
  id: string;
  name: string;
  type: 'social' | 'search' | 'news' | 'video';
  icon?: string;
  enabled: boolean;
  priority: number;
}

const SOURCE_CONFIG: SourceConfig[] = [
  { id: 'twitter', name: 'Twitter', type: 'social', enabled: true, priority: 1 },
  { id: 'weibo', name: '微博热搜', type: 'social', enabled: true, priority: 2 },
  { id: 'bilibili', name: 'Bilibili', type: 'video', enabled: true, priority: 3 },
  { id: 'weixin', name: '微信公众号', type: 'social', enabled: true, priority: 4 },
  { id: 'hackernews', name: 'HackerNews', type: 'social', enabled: true, priority: 5 },
  { id: 'sogou', name: '搜狗搜索', type: 'search', enabled: true, priority: 6 },
  { id: 'bing', name: 'Bing', type: 'search', enabled: true, priority: 7 },
  { id: 'google', name: 'Google', type: 'search', enabled: true, priority: 8 },
  { id: 'duckduckgo', name: 'DuckDuckGo', type: 'search', enabled: true, priority: 9 },
  { id: 'baidu', name: '百度', type: 'search', enabled: false, priority: 10 },
  { id: 'douyin', name: '抖音', type: 'video', enabled: false, priority: 11 },
  { id: 'xiaohongshu', name: '小红书', type: 'social', enabled: false, priority: 12 },
];

app.get('/api/sources/config', (req, res) => {
  res.json(SOURCE_CONFIG);
});
```

#### 2. 前端动态获取来源

```typescript
// FilterSortBar.tsx
import { useState, useEffect } from 'react';

interface SourceConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
}

export function FilterSortBar() {
  const [sourceOptions, setSourceOptions] = useState<SourceConfig[]>([]);
  
  useEffect(() => {
    fetch('/api/sources/config')
      .then(res => res.json())
      .then(config => {
        setSourceOptions(config.filter(s => s.enabled));
      });
  }, []);
  
  const SOURCE_OPTIONS = [
    { value: '', label: '全部来源' },
    ...sourceOptions.map(s => ({ value: s.id, label: s.name }))
  ];
  
  // ... rest of component
}
```

---

### 方案二：统一枚举（简单方案）

创建统一的数据源枚举，前端和后端都使用

#### 1. 创建共享枚举

```typescript
// packages/shared/src/sources.ts
export const SOURCES = {
  TWITTER: 'twitter',
  WEIBO: 'weibo',
  BILIBILI: 'bilibili',
  WEIXIN: 'weixin',
  HACKERNEWS: 'hackernews',
  SOGOU: 'sogou',
  BING: 'bing',
  GOOGLE: 'google',
  DUCKDUCKGO: 'duckduckgo',
} as const;

export const SOURCE_CONFIG = {
  twitter: { label: 'Twitter', type: 'social', enabled: true, priority: 1 },
  weibo: { label: '微博热搜', type: 'social', enabled: true, priority: 2 },
  bilibili: { label: 'Bilibili', type: 'video', enabled: true, priority: 3 },
  weixin: { label: '微信公众号', type: 'social', enabled: true, priority: 4 },
  hackernews: { label: 'HackerNews', type: 'social', enabled: true, priority: 5 },
  sogou: { label: '搜狗搜索', type: 'search', enabled: true, priority: 6 },
  bing: { label: 'Bing', type: 'search', enabled: true, priority: 7 },
  google: { label: 'Google', type: 'search', enabled: true, priority: 8 },
  duckduckgo: { label: 'DuckDuckGo', type: 'search', enabled: true, priority: 9 },
} as const;

export type SourceId = keyof typeof SOURCES;
```

#### 2. 后端使用统一枚举

```typescript
// DataSourceManager.ts
import { SOURCES, SOURCE_CONFIG } from '@hot-monitor/types';

class DataSourceManager {
  private registerDefaultSources(): void {
    // Twitter
    const twitter = new TwitterDataSource();
    this.sources.set(SOURCES.TWITTER, twitter);
    
    // 微博热搜
    const weibo = new WeiboDataSource();
    this.sources.set(SOURCES.WEIBO, weibo);
    
    // ... 其他来源
  }
}
```

#### 3. 前端使用统一枚举

```typescript
// FilterSortBar.tsx
import { SOURCES, SOURCE_CONFIG } from '@hot-monitor/types';

const SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  ...Object.entries(SOURCE_CONFIG).map(([id, config]) => ({
    value: id,
    label: config.label
  }))
];
```

---

## 推荐方案

**推荐方案一：统一来源配置 + API**

优点：
1. 前端动态获取来源列表，无需重新部署
2. 来源配置可运行时修改
3. 统一管理前端和后端

缺点：
1. 需要创建新的API端点
2. 前端需要处理异步加载

**备选方案二：统一枚举**

优点：
1. 简单直接
2. 类型安全
3. 无需额外API

缺点：
1. 修改来源需要重新部署
2. 前端和后端都需要修改

---

## 下一步行动

1. 创建统一的数据源枚举或配置
2. 在后端DataSourceManager中实现所有来源
3. 前端动态获取来源配置
4. 更新过滤器组件使用统一配置
5. 测试所有来源的搜索功能

---

**文档创建时间**：2026年5月27日
