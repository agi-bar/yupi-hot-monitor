# HotPulse 前端架构分析文档

> 本文档深入分析 HotPulse 热点监控系统的前端实现细节，涵盖组件架构、状态管理、样式系统、动画效果和服务层设计。

---

## 一、技术栈概览

### 1.1 核心依赖

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 19.2.0 | UI 框架 |
| **TypeScript** | 5.9.3 | 类型安全 |
| **Vite** | 7.2.4 | 构建工具 |
| **TailwindCSS** | 4.1.18 | 原子化样式 |
| **Framer Motion** | 12.31.1 | 交互动画 |
| **Lucide React** | 0.563.0 | 图标库 |
| **Socket.io Client** | 4.8.3 | WebSocket 客户端 |
| **clsx + tailwind-merge** | - | 样式组合工具 |

### 1.2 项目结构

```
client/
├── public/
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── ui/                    # 视觉特效组件
│   │   │   ├── background-beams.tsx
│   │   │   ├── meteors.tsx
│   │   │   ├── moving-border.tsx
│   │   │   ├── spotlight.tsx
│   │   │   └── text-generate-effect.tsx
│   │   └── FilterSortBar.tsx     # 筛选排序组件
│   ├── services/
│   │   ├── api.ts                # REST API 服务
│   │   └── socket.ts             # WebSocket 服务
│   ├── utils/
│   │   ├── relativeTime.ts        # 时间格式化
│   │   └── sortHotspots.ts       # 排序逻辑
│   ├── lib/
│   │   └── utils.ts              # 通用工具函数
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   ├── index.css                  # 全局样式
│   └── App.css                   # 组件样式
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

---

## 二、入口与初始化

### 2.1 main.tsx

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**关键点：**
- 使用 `createRoot` (React 18+ 新 API)
- 启用 `StrictMode` 进行开发时额外检查
- 入口点 `#root` 位于 `index.html`

### 2.2 Vite 配置

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
})
```

**代理配置说明：**
| 路径 | 目标 | 用途 |
|------|------|------|
| `/api/*` | localhost:3001 | REST API 请求 |
| `/socket.io/*` | localhost:3001 | WebSocket 连接 |

---

## 三、样式系统

### 3.1 设计令牌 (Design Tokens)

```css
:root {
  --bg-base: #050510;           /* 主背景：深蓝黑 */
  --bg-surface: #0a0a1a;        /* 卡片背景 */
  --bg-elevated: #111127;       /* 悬浮层背景 */
  --bg-hover: #16163a;          /* 悬浮状态背景 */
  --border-subtle: rgba(59, 130, 246, 0.08);
  --border-default: rgba(59, 130, 246, 0.15);
  --border-active: rgba(59, 130, 246, 0.35);
  --text-primary: #e8eaf0;       /* 主文字：冷白 */
  --text-secondary: #8b8fa8;     /* 次要文字：灰蓝 */
  --text-muted: #5a5e78;        /* 弱化文字 */
  --accent-blue: #3b82f6;        /* 主强调色：蓝 */
  --accent-cyan: #06b6d4;        /* 次强调色：青 */
  --accent-emerald: #10b981;     /* 成功色 */
  --accent-amber: #f59e0b;       /* 警告色 */
  --accent-red: #ef4444;         /* 错误/紧急色 */
}
```

### 3.2 自定义动画

```css
@theme inline {
  --animate-spotlight: spotlight 2s ease 0.75s 1 forwards;
  --animate-meteor-effect: meteor 5s linear infinite;
  --animate-shimmer: shimmer 2s linear infinite;
  --animate-pulse-soft: pulse-soft 3s ease-in-out infinite;

  @keyframes spotlight {
    0% { opacity: 0; transform: translate(-72%, -62%) scale(0.5); }
    100% { opacity: 1; transform: translate(-50%, -40%) scale(1); }
  }
  @keyframes meteor {
    0% { transform: rotate(215deg) translateX(0); opacity: 1; }
    70% { opacity: 1; }
    100% { transform: rotate(215deg) translateX(-500px); opacity: 0; }
  }
  @keyframes shimmer {
    from { background-position: 0 0; }
    to { background-position: -200% 0; }
  }
  @keyframes pulse-soft {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
}
```

### 3.3 TailwindCSS v4 集成

本项目使用 TailwindCSS v4，采用 CSS-first 配置方式：

```css
@import "tailwindcss";
```

不再需要 `tailwind.config.js`，所有配置通过 `@theme` 指令在 CSS 中完成。

---

## 四、组件架构

### 4.1 App.tsx 主组件

`App.tsx` 是单文件应用，包含所有业务逻辑，采用功能型组件模式。

#### 状态管理

```typescript
// 数据状态
const [keywords, setKeywords] = useState<Keyword[]>([]);
const [hotspots, setHotspots] = useState<Hotspot[]>([]);
const [stats, setStats] = useState<Stats | null>(null);
const [notifications, setNotifications] = useState<Notification[]>([]);
const [unreadCount, setUnreadCount] = useState(0);

// UI 状态
const [newKeyword, setNewKeyword] = useState('');
const [searchQuery, setSearchQuery] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [isChecking, setIsChecking] = useState(false);
const [showNotifications, setShowNotifications] = useState(false);
const [activeTab, setActiveTab] = useState<'dashboard' | 'keywords' | 'search'>('dashboard');
const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

// 筛选与分页
const [dashboardFilters, setDashboardFilters] = useState<FilterState>({ ...defaultFilterState });
const [searchFilters, setSearchFilters] = useState<FilterState>({ ...defaultFilterState });
const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1);
const [searchResults, setSearchResults] = useState<Hotspot[]>([]);

// 展开/折叠
const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
const [expandedContents, setExpandedContents] = useState<Set<string>>(new Set());
const [allReasonsExpanded, setAllReasonsExpanded] = useState(false);
```

#### 生命周期

```typescript
// 初始数据加载
useEffect(() => {
  loadData();
}, [loadData]); // 依赖变化时重新加载

// 筛选条件变化时重置页码
useEffect(() => {
  setCurrentPage(1);
}, [dashboardFilters]);

// WebSocket 事件监听
useEffect(() => {
  const unsubHotspot = onNewHotspot((hotspot) => {
    setHotspots(prev => [hotspot as Hotspot, ...prev.slice(0, 19)]);
    showToast('发现新热点: ' + hotspot.title.slice(0, 30), 'success');
    loadData();
  });

  const unsubNotif = onNotification(() => {
    setUnreadCount(prev => prev + 1);
  });

  return () => {
    unsubHotspot();
    unsubNotif();
  };
}, [loadData]);
```

#### 核心业务逻辑

| 功能 | 处理函数 | 描述 |
|------|----------|------|
| 添加关键词 | `handleAddKeyword` | POST /api/keywords |
| 删除关键词 | `handleDeleteKeyword` | DELETE /api/keywords/:id |
| 切换关键词 | `handleToggleKeyword` | PATCH /api/keywords/:id/toggle |
| 手动搜索 | `handleSearch` | POST /api/hotspots/search |
| 触发检查 | `handleManualCheck` | POST /api/check-hotspots |
| 标记已读 | `handleMarkAllRead` | PATCH /api/notifications/read-all |
| 展开理由 | `toggleReason` | 切换单条 AI 分析理由 |
| 展开内容 | `toggleContent` | 切换单条原始内容 |
| 一键展开 | `toggleAllReasons` | 展开/折叠所有理由 |

### 4.2 FilterSortBar 组件

筛选排序栏组件，支持多维度筛选。

#### 筛选维度

```typescript
interface FilterState {
  source: string;       // 来源平台
  importance: string;    // 重要程度
  keywordId: string;    // 关键词
  timeRange: string;    // 时间范围
  isReal: string;       // 真实性
  sortBy: string;       // 排序字段
  sortOrder: string;    // 排序方向
}
```

#### 筛选选项

| 维度 | 选项 |
|------|------|
| **来源** | 全部、Twitter、Bing、Google、搜狗、Bilibili、微博热搜、HackerNews、DuckDuckGo |
| **重要程度** | 全部、🔴 紧急、🟠 高、🟡 中、🟢 低 |
| **时间范围** | 全部、最近 1 小时、今天、最近 7 天、最近 30 天 |
| **真实性** | 全部、✅ 真实、⚠️ 疑似虚假 |
| **排序** | 最新发现、最新发布、重要程度、相关性、热度综合 |

#### 组件设计

- **Dropdown 组件**：可复用下拉选择器，支持点击外部关闭
- **FilterTag 组件**：已选筛选条件标签，支持一键移除
- **折叠面板**：筛选条件可展开/收起

---

## 五、服务层设计

### 5.1 REST API 服务 (api.ts)

#### 类型定义

```typescript
export interface Keyword {
  id: string;
  text: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { hotspots: number };
}

export interface Hotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId: string | null;
  isReal: boolean;
  relevance: number;
  relevanceReason: string | null;
  keywordMentioned: boolean | null;
  importance: 'low' | 'medium' | 'high' | 'urgent';
  summary: string | null;
  // 互动数据
  viewCount: number | null;
  likeCount: number | null;
  retweetCount: number | null;
  replyCount: number | null;
  commentCount: number | null;
  quoteCount: number | null;
  danmakuCount: number | null;
  // 作者信息
  authorName: string | null;
  authorUsername: string | null;
  authorAvatar: string | null;
  authorFollowers: number | null;
  authorVerified: boolean | null;
  publishedAt: string | null;
  createdAt: string;
  keyword: { id: string; text: string; category: string | null } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  hotspotId: string | null;
  createdAt: string;
}

export interface Stats {
  total: number;
  today: number;
  urgent: number;
  bySource: Record<string, number>;
}
```

#### API 封装

```typescript
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
```

#### API 方法

| 模块 | 方法 | 端点 | 说明 |
|------|------|------|------|
| **keywordsApi** | `getAll` | GET /keywords | 获取所有关键词 |
| | `getById` | GET /keywords/:id | 获取单个关键词 |
| | `create` | POST /keywords | 创建关键词 |
| | `update` | PUT /keywords/:id | 更新关键词 |
| | `delete` | DELETE /keywords/:id | 删除关键词 |
| | `toggle` | PATCH /keywords/:id/toggle | 切换启用状态 |
| **hotspotsApi** | `getAll` | GET /hotspots | 获取热点列表（分页） |
| | `getStats` | GET /hotspots/stats | 获取统计数据 |
| | `getById` | GET /hotspots/:id | 获取热点详情 |
| | `search` | POST /hotspots/search | 全局搜索 |
| | `delete` | DELETE /hotspots/:id | 删除热点 |
| **notificationsApi** | `getAll` | GET /notifications | 获取通知列表 |
| | `markAsRead` | PATCH /notifications/:id/read | 标记已读 |
| | `markAllAsRead` | PATCH /notifications/read-all | 全部已读 |
| | `delete` | DELETE /notifications/:id | 删除通知 |
| | `clear` | DELETE /notifications | 清空通知 |
| **settingsApi** | `getAll` | GET /settings | 获取设置 |
| | `update` | PUT /settings | 更新设置 |
| **其他** | `triggerHotspotCheck` | POST /check-hotspots | 手动触发检查 |

### 5.2 WebSocket 服务 (socket.ts)

#### 连接管理

```typescript
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling']  // 优先 WebSocket，降级轮询
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error);
    });
  }
  return socket;
}
```

#### 订阅管理

```typescript
export function subscribeToKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('subscribe', keywords);
}

export function unsubscribeFromKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('unsubscribe', keywords);
}
```

#### 事件监听

```typescript
export function onNewHotspot(callback: (hotspot: HotspotEvent) => void): () => void {
  const s = getSocket();
  s.on('hotspot:new', callback);
  return () => s.off('hotspot:new', callback);  // 返回取消订阅函数
}

export function onNotification(callback: (notification: NotificationEvent) => void): () => void {
  const s = getSocket();
  s.on('notification', callback);
  return () => s.off('notification', callback);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

#### 事件类型

```typescript
export interface HotspotEvent {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  importance: string;
  summary: string | null;
  keyword?: { text: string } | null;
}

export interface NotificationEvent {
  type: string;
  title: string;
  content: string;
  hotspotId?: string;
  importance?: string;
}
```

---

## 六、工具函数

### 6.1 样式工具 (lib/utils.ts)

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**功能：** 合并 Tailwind 类名，处理冲突（如 `twMerge` 自动移除重复类）。

### 6.2 时间工具 (utils/relativeTime.ts)

```typescript
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 0) return '刚刚';
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  if (months < 12) return `${months} 个月前`;
  return `${years} 年前`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

### 6.3 排序工具 (utils/sortHotspots.ts)

```typescript
export const IMPORTANCE_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function calcHotScore(item: SortableHotspot): number {
  const likes = item.likeCount || 0;
  const retweets = item.retweetCount || 0;
  const views = item.viewCount || 0;
  return likes * 10 + retweets * 5 + Math.log10(Math.max(views, 1)) * 2;
}

export function sortHotspots<T extends SortableHotspot>(
  items: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): T[] {
  // 排序逻辑...
}
```

**排序维度：**
| 字段 | 说明 |
|------|------|
| `createdAt` | 按抓取时间排序 |
| `publishedAt` | 按发布时间排序 |
| `importance` | 按重要程度（urgent > high > medium > low） |
| `relevance` | 按相关性评分 |
| `hot` | 按热度综合评分 |

---

## 七、视觉特效组件

### 7.1 BackgroundBeams

网格背景 + 渐变光晕效果。

```typescript
export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div className="absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)]" />
      <svg>
        <defs>
          <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="rgba(148,163,184,0.08)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>
    </div>
  );
};
```

### 7.2 Spotlight

聚光灯动画效果，营造聚焦感。

```typescript
export const Spotlight = ({ className, fill = "white" }) => {
  return (
    <svg className={cn("animate-spotlight pointer-events-none ...", className)}>
      <ellipse fill={fill} fillOpacity="0.21" />
      <defs>
        <filter id="filter">
          <feGaussianBlur stdDeviation="151" />
        </filter>
      </defs>
    </svg>
  );
};
```

### 7.3 Meteors

流星动画效果，增强科技感。

```typescript
export const Meteors = ({ number = 12, className }) => {
  const meteors = new Array(number).fill(true);
  return (
    <>
      {meteors.map((_, idx) => (
        <span
          key={"meteor" + idx}
          className="animate-meteor-effect ..."
          style={{
            left: Math.floor(Math.random() * 800 - 400) + "px",
            animationDelay: Math.random() * 0.6 + 0.2 + "s",
            animationDuration: Math.floor(Math.random() * 8 + 2) + "s",
          }}
        />
      ))}
    </>
  );
};
```

---

## 八、UI 设计亮点

### 8.1 卡片信息密度

热点卡片展示丰富信息：

```
┌────────────────────────────────────────────────────────────┐
│ [🔴 urgent] [🐦 Twitter] [📌 Claude] [✅ 可信] [🎯 直接提及] │
│ [🔥 热 65]                                                  │
│                                                             │
│ 热点标题（可展开两行）                                        │
│                                                             │
│ AI 摘要：此内容与【Claude】的关联：...                        │
│                                                             │
│ 👤 作者名 @username  ✓认证  12.5k粉丝                        │
│                                                             │
│ 🎯 相关性 85%  ⚡5.2k  🔄2.1k  💬800  👁150k               │
│                                                             │
│ 🕐 发布 2小时前   ⚡抓取 30分钟前                            │
│                                                             │
│ ▼ AI 分析理由（可展开）                                      │
│   此内容直接讨论了 Claude 4.0 的新特性...                    │
│                                                             │
│ ▼ 原始内容（可展开）                                        │
└────────────────────────────────────────────────────────────┘
```

### 8.2 标签系统

| 标签类型 | 示例 | 说明 |
|----------|------|------|
| 重要程度 | 🔴 urgent、🟠 high、🟡 medium、🟢 low | AI 评估 |
| 来源平台 | 🐦 Twitter、🔍 Bing、📺 B站 | 数据来源 |
| 真实性 | ✅ 可信、⚠️ 可疑 | AI 判定 |
| 关键词关联 | 📌 直接提及、🔗 间接相关 | 是否直接提及 |
| 热度等级 | 🔥 爆、🔥 热、🌡 温、❄️ 凉、💧 冷 | 综合热度 |

### 8.3 热度评分算法

```typescript
function calcHeatScore(h: Hotspot): number {
  const likes = h.likeCount ?? 0;
  const retweets = h.retweetCount ?? 0;
  const replies = h.replyCount ?? 0;
  const comments = h.commentCount ?? 0;
  const quotes = h.quoteCount ?? 0;
  const views = h.viewCount ?? 0;
  
  const raw = likes * 2 + retweets * 3 + replies * 1.5 
            + comments * 1.5 + quotes * 2 + views / 100;
  
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}
```

**权重设计：** 转发 > 引用 > 点赞 > 评论/回复 > 浏览

---

## 九、响应式设计

### 9.1 断点策略

使用 TailwindCSS 响应式前缀：

| 前缀 | 断点 | 用途 |
|------|------|------|
| 无 | < 640px | 手机 |
| `md:` | ≥ 768px | 平板 |
| `lg:` | ≥ 1024px | 桌面 |

### 9.2 布局适配

```typescript
// 统计卡片网格
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

// 关键词网格
<div className="grid gap-3 md:grid-cols-2">

// 热点卡片
<div className="flex flex-wrap items-center gap-2 mb-3">
```

---

## 十、性能优化

### 10.1 React 性能优化

```typescript
// 1. useCallback 缓存回调函数
const loadData = useCallback(async () => {
  // ...
}, [dashboardFilters, currentPage]);

// 2. useMemo 缓存计算结果
const filteredSearchResults = useMemo(() => {
  let results = [...searchResults];
  // 筛选逻辑...
  return sortHotspots(results, ...);
}, [searchResults, searchFilters]);

// 3. Set 数据结构管理展开状态
const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

// 4. 虚拟列表（未来可考虑）
// 当前实现限制热点列表只保留 20 条
```

### 10.2 分页策略

```typescript
const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1);

// 每页 20 条，控制 DOM 节点数量
const LIMIT = 20;
```

---

## 十一、错误处理

### 11.1 Toast 通知

```typescript
const showToast = (message: string, type: 'success' | 'error') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3000);
};
```

### 11.2 加载状态

```typescript
// 全局加载
const [isLoading, setIsLoading] = useState(false);

// 操作级加载
const [isChecking, setIsChecking] = useState(false);
```

### 11.3 空状态展示

```typescript
{hotspots.length === 0 ? (
  <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
    <p className="text-slate-500">尚未发现热点</p>
    <p className="text-sm text-slate-600 mt-1">添加监控关键词开始追踪</p>
  </div>
) : (...) }
```

---

## 十二、开发规范

### 12.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `FilterSortBar`, `BackgroundBeams` |
| 工具函数 | camelCase | `relativeTime`, `calcHeatScore` |
| 类型/接口 | PascalCase | `FilterState`, `HotspotEvent` |
| CSS 类 | Tailwind 直接使用 | `text-blue-400`, `bg-white/5` |

### 12.2 代码组织

```
App.tsx 结构：
├── 工具函数（calcHeatScore, getHeatLevel）
├── 主组件 App
│   ├── State Hooks
│   ├── Callback Hooks (loadData, handleAddKeyword, ...)
│   ├── Effects
│   └── JSX (Header, Main Content, Modals)
```

### 12.3 样式编写

```typescript
// ✅ 推荐：使用 cn() 组合类名
className={cn(
  "p-5 rounded-2xl",
  isActive ? "bg-blue-500/20" : "bg-white/5"
)}

// ✅ 推荐：使用 CSS 变量
style={{ backgroundColor: 'var(--bg-surface)' }}

// ✅ 推荐：使用 Tailwind 变量
color: 'text-slate-500'
```

---

## 十三、总结

HotPulse 前端采用 **React + TypeScript + TailwindCSS** 技术栈，通过以下设计实现高质量用户体验：

| 维度 | 实现方式 |
|------|----------|
| **架构** | 单文件应用 + 功能模块分离 |
| **状态** | React Hooks (useState/useEffect/useCallback/useMemo) |
| **通信** | REST API + WebSocket 双通道 |
| **样式** | TailwindCSS v4 + CSS 自定义属性 |
| **动画** | Framer Motion + CSS 关键帧动画 |
| **类型** | 完整的 TypeScript 类型定义 |
| **设计** | 赛博朋克风格 + 丰富信息密度卡片 |

---

> 本文档为前端架构详细分析，供前端开发维护参考。
