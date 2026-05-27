# HotPulse AI 热点监控系统架构分析文档

> 本文档基于 `docs/` 目录下的原始文档资料，对项目整体架构、模块划分、功能逻辑和依赖关系进行系统性梳理与整合，形成独立完整的分析文档。

---

## 一、项目概述

### 1.1 项目定位

HotPulse 是一款面向 AI 编程博主和技术内容创作者的**智能化热点监控工具**，旨在实现热点信息的自动化发现、筛选与推送，减少人工搜索成本。

### 1.2 核心价值

- **自动化**：无需人工干预，系统定时抓取多源热点
- **智能化**：借助 AI 能力识别假冒内容、评估相关性
- **实时性**：通过 WebSocket 实现秒级推送通知

### 1.3 目标用户

- AI/技术领域博主
- 科技资讯追踪者
- 需要实时掌握行业动态的专业人士

---

## 二、技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端层 (Client)                          │
│  React 18 + TypeScript + Vite + TailwindCSS + Framer Motion   │
│  ├── 热点雷达仪表盘 (Dashboard)                                  │
│  ├── 关键词管理 (Keywords)                                       │
│  └── 搜索功能 (Search)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP REST API + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         后端层 (Server)                          │
│  Node.js + Express + TypeScript + Socket.io                    │
│  ├── API Routes (keywords/hotspots/settings/notifications)       │
│  ├── Services (search/twitter/ai/email/chinaSearch)             │
│  ├── Jobs (hotspotChecker - 定时任务)                            │
│  └── 数据库访问层 (Prisma ORM)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         数据层 (Data)                            │
│  SQLite + Prisma ORM                                           │
│  ├── Keyword (关键词)                                           │
│  ├── Hotspot (热点)                                            │
│  ├── Notification (通知)                                        │
│  └── Setting (设置)                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         外部服务层 (External)                     │
│  ├── AI 服务 (MiniMax/MiniMax-M2.5 via Anthropic API)         │
│  ├── 社交平台 (Twitter API, 微博, B站)                          │
│  ├── 搜索引擎 (Bing, 搜狗, HackerNews)                          │
│  └── 邮件服务 (SMTP)                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选型

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **前端框架** | React 18 + TypeScript | 类型安全、组件化开发 |
| **构建工具** | Vite | 极速开发体验 |
| **样式方案** | TailwindCSS | 原子化 CSS，快速迭代 |
| **动画库** | Framer Motion | 流畅交互动效 |
| **后端框架** | Express.js | 轻量、灵活的 Node.js 框架 |
| **实时通信** | Socket.io | WebSocket 封装，支持自动重连 |
| **ORM** | Prisma | 类型安全的数据库访问 |
| **数据库** | SQLite | 零配置、文件级存储 |
| **定时任务** | node-cron | 稳定的 Cron 表达式调度 |
| **AI 服务** | MiniMax API (Anthropic 兼容) | 内容分析与真假识别 |
| **邮件服务** | Nodemailer | 跨平台邮件发送 |

### 2.3 端口配置

| 服务 | 默认端口 | 说明 |
|------|----------|------|
| 后端 API | 3001 | Express + Socket.io |
| 前端页面 | 5173 | Vite 开发服务器 |
| Prisma Studio | 5555 | 数据库可视化（可选） |

---

## 三、模块划分

### 3.1 前端模块结构

```
client/src/
├── components/                    # UI 组件
│   ├── ui/                        # 基础 UI 组件
│   │   ├── background-beams.tsx    # 背景粒子效果
│   │   ├── meteors.tsx            # 流星动画
│   │   ├── moving-border.tsx       # 动态边框
│   │   ├── spotlight.tsx          # 聚光灯效果
│   │   └── text-generate-effect.tsx
│   └── FilterSortBar.tsx          # 筛选排序栏
├── services/                      # API 服务层
│   ├── api.ts                     # REST API 调用封装
│   └── socket.ts                  # WebSocket 客户端封装
├── utils/                         # 工具函数
│   ├── relativeTime.ts            # 相对时间格式化
│   └── sortHotspots.ts            # 热点排序逻辑
├── lib/
│   └── utils.ts                   # 通用工具函数
├── App.tsx                        # 主应用组件
├── main.tsx                       # 入口文件
├── index.css                      # 全局样式
└── App.css                        # 组件样式
```

### 3.2 后端模块结构

```
server/src/
├── routes/                        # API 路由
│   ├── keywords.ts               # 关键词 CRUD
│   ├── hotspots.ts               # 热点查询与搜索
│   ├── settings.ts               # 系统设置
│   └── notifications.ts          # 通知管理
├── services/                      # 业务逻辑层
│   ├── search.ts                 # 国际搜索引擎爬虫
│   ├── chinaSearch.ts             # 国内平台爬虫
│   ├── twitter.ts                # Twitter API 集成
│   ├── ai.ts                     # AI 内容分析
│   └── email.ts                  # 邮件通知
├── jobs/                          # 定时任务
│   └── hotspotChecker.ts         # 热点检查主任务
├── utils/                         # 工具函数
│   └── sortHotspots.ts           # 热点排序
├── __tests__/                      # 单元测试
│   ├── aiRelevance.test.ts
│   └── sortHotspots.test.ts
├── db.ts                          # Prisma 客户端
├── types.ts                       # TypeScript 类型定义
├── index.ts                       # 服务入口
└── test-sources.ts               # 测试数据源
```

### 3.3 数据库模型

基于 Prisma Schema 的数据模型设计：

```prisma
model Keyword {
  id        String    @id @default(uuid())
  text      String    @unique        // 关键词内容（唯一索引）
  category  String?                // 分类标签
  isActive  Boolean   @default(true) // 是否启用
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  hotspots  Hotspot[]              // 关联的热点列表
}

model Hotspot {
  id              String    @id @default(uuid())
  title           String                   // 热点标题
  content         String                   // 原始内容
  url             String                   // 来源链接
  source          String                   // 来源平台
  sourceId        String?                  // 平台原始 ID
  isReal          Boolean   @default(true) // AI 判定：是否真实
  relevance       Int      @default(0)    // 相关性评分 0-100
  relevanceReason String?                  // AI 判定理由
  keywordMentioned Boolean?                // 是否直接提及关键词
  importance      String   @default("low") // 重要程度
  summary         String?                  // AI 生成摘要
  // 互动数据
  viewCount       Int?
  likeCount       Int?
  retweetCount    Int?
  replyCount      Int?
  commentCount    Int?
  quoteCount      Int?
  danmakuCount    Int?
  // 作者信息
  authorName      String?
  authorUsername  String?
  authorAvatar    String?
  authorFollowers Int?
  authorVerified  Boolean?
  publishedAt     DateTime?
  createdAt       DateTime  @default(now())
  keywordId       String?
  keyword         Keyword?  @relation(...)
  
  @@unique([url, source])        // URL + 来源联合唯一索引
}

model Notification {
  id        String   @id @default(uuid())
  type      String                   // 通知类型
  title     String
  content   String
  isRead    Boolean  @default(false)
  hotspotId String?
  createdAt DateTime @default(now())
}

model Setting {
  id    String @id @default(uuid())
  key   String @unique
  value String
}
```

---

## 四、功能逻辑详解

### 4.1 关键词监控流程

```
用户添加关键词
       │
       ▼
┌──────────────────┐
│ 保存至数据库     │
│ Keyword 表      │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 定时任务触发     │
│ 每 30 分钟执行   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 查询扩展         │
│ Query Expansion  │
│ AI + 文本分析    │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 多源数据抓取     │
│ Twitter/Bing/    │
│ 搜狗/微博/B站    │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 去重 + 过滤      │
│ 按来源优先级排序 │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ AI 内容分析      │
│ 真假识别 +       │
│ 相关性评估       │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 保存 + 通知     │
│ WebSocket +     │
│ 邮件（高重要性）│
└──────────────────┘
```

### 4.2 数据抓取策略

#### 4.2.1 国际数据源

| 数据源 | 获取方式 | 请求频率 | 配额限制 |
|--------|----------|----------|----------|
| **Twitter/X** | twitterapi.io API | 每关键词一次 | 15 条/关键词 |
| **Bing** | 网页爬虫 (Cheerio) | 5 秒间隔 | 20 条/请求 |
| **HackerNews** | Algolia HN API | 1 秒间隔 | 20 条/请求 |
| **DuckDuckGo** | 网页爬虫 | 3 秒间隔 | 无官方限制 |

#### 4.2.2 国内数据源

| 数据源 | 获取方式 | 特殊处理 |
|--------|----------|----------|
| **搜狗搜索** | 网页爬虫 | 关键词直接搜索 |
| **微博热搜** | 网页爬虫 | 实时榜单抓取 |
| **B站 (Bilibili)** | 网页爬虫 + 弹幕 API | 视频数据 + 弹幕数 |

#### 4.2.3 频率控制机制

```typescript
class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minInterval - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }
}

// 各数据源配置
const bingLimiter = new RateLimiter(5000);      // 5 秒
const googleLimiter = new RateLimiter(10000);   // 10 秒
const duckduckgoLimiter = new RateLimiter(3000); // 3 秒
const hackernewsLimiter = new RateLimiter(1000); // 1 秒
```

### 4.3 AI 分析引擎

#### 4.3.1 核心能力

基于 MiniMax-M2.5 模型实现两项核心 AI 功能：

**1. 查询扩展 (Query Expansion)**

```typescript
export async function expandKeyword(keyword: string): Promise<string[]> {
  // 使用 AI 将关键词扩展为多个变体
  // - 各种写法变体（大小写、空格、连字符）
  // - 核心组成词拆分
  // - 常见别称、缩写、中英文对照
  // 结果缓存，同一关键词不重复调用
}
```

**2. 内容分析 (Content Analysis)**

```typescript
export async function analyzeContent(
  content: string, 
  keyword: string, 
  preMatchResult: { matched: boolean; matchedTerms: string[] }
): Promise<AIAnalysis>
```

**AI 分析 Prompt 设计：**

```
分析要点：
1. 判断是否为真实有价值的信息（排除标题党、假新闻）
2. 判断内容是否【直接】涉及关键词
   - 仅同领域但未提及：相关性 < 40
   - 间接沾边：30-50 分
   - 直接讨论/提及：> 60 分
3. 判断是否直接提及关键词
4. 评估重要程度（low/medium/high/urgent）
5. 生成摘要说明内容与关键词的关联
6. 提供相关性打分理由

输出格式：
{
  "isReal": true/false,
  "relevance": 0-100,
  "relevanceReason": "...",
  "keywordMentioned": true/false,
  "importance": "low/medium/high/urgent",
  "summary": "此内容与【关键词】的关联：..."
}
```

#### 4.3.2 过滤规则

| 规则 | 条件 | 动作 |
|------|------|------|
| 假新闻过滤 | `isReal === false` | 丢弃 |
| 低相关性过滤 | `relevance < 50` | 丢弃 |
| 间接相关过滤 | `keywordMentioned === false && relevance < 65` | 丢弃 |
| 新鲜度过滤 | 发布时间 > 7 天 | 丢弃 |
| 重复检测 | URL + 来源已存在 | 跳过 |

### 4.4 通知系统

#### 4.4.1 实时推送 (WebSocket)

```typescript
// 服务端事件
hotspot:new      // 新热点发现（按关键词分发）
hotspot:update   // 热点更新
notification     // 通用通知消息

// 客户端订阅
socket.on('subscribe', (keywords: string[]) => {
  keywords.forEach(kw => socket.join(`keyword:${kw}`));
});
```

#### 4.4.2 邮件通知

- **触发条件**：热点重要程度为 `high` 或 `urgent`
- **邮件内容**：标题、摘要、重要程度、相关性、原文链接
- **发送方式**：Nodemailer + SMTP

### 4.5 前端交互逻辑

#### 4.5.1 三大功能模块

| 模块 | 功能 | 核心组件 |
|------|------|----------|
| **热点雷达** | 展示实时热点流 | 统计卡片、热点列表、分页、筛选排序 |
| **监控词管理** | CRUD 关键词 | 添加表单、关键词网格、开关控制 |
| **搜索功能** | 全局内容搜索 | 搜索表单、筛选排序、结果展示 |

#### 4.5.2 筛选与排序

```typescript
interface FilterState {
  source?: string;           // 来源平台
  importance?: string;       // 重要程度
  keywordId?: string;        // 关键词
  timeRange?: '1h' | 'today' | '7d' | '30d';
  isReal?: 'true' | 'false';
  sortBy?: 'createdAt' | 'relevance' | 'importance';
  sortOrder?: 'asc' | 'desc';
}
```

#### 4.5.3 热度评分算法

```typescript
function calcHeatScore(h: Hotspot): number {
  const likes = h.likeCount ?? 0;
  const retweets = h.retweetCount ?? 0;
  const replies = h.replyCount ?? 0;
  const comments = h.commentCount ?? 0;
  const quotes = h.quoteCount ?? 0;
  const views = h.viewCount ?? 0;
  
  // 加权公式：转发最重、其次点赞、然后评论/回复
  const raw = likes * 2 + retweets * 3 + replies * 1.5 
            + comments * 1.5 + quotes * 2 + views / 100;
  
  // log 压缩到 0-100
  return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}
```

热度等级：

| 分数 | 等级 | 颜色 |
|------|------|------|
| ≥80 | 爆 | 红色 |
| ≥60 | 热 | 橙色 |
| ≥40 | 温 | 琥珀色 |
| ≥20 | 凉 | 蓝色 |
| <20 | 冷 | 灰色 |

---

## 五、API 接口设计

### 5.1 RESTful API

#### 关键词管理

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/keywords` | 获取所有关键词 |
| GET | `/api/keywords/:id` | 获取单个关键词 |
| POST | `/api/keywords` | 创建关键词 |
| PUT | `/api/keywords/:id` | 更新关键词 |
| DELETE | `/api/keywords/:id` | 删除关键词 |
| PATCH | `/api/keywords/:id/toggle` | 切换启用状态 |

#### 热点数据

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/hotspots` | 获取热点列表（支持分页、筛选、排序） |
| GET | `/api/hotspots/stats` | 获取统计数据 |
| GET | `/api/hotspots/:id` | 获取热点详情 |
| POST | `/api/hotspots/search` | 全局内容搜索 |
| DELETE | `/api/hotspots/:id` | 删除热点 |
| POST | `/api/check-hotspots` | 手动触发热点检查 |

#### 通知管理

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/notifications` | 获取通知列表 |
| PATCH | `/api/notifications/:id/read` | 标记已读 |
| PATCH | `/api/notifications/read-all` | 全部标记已读 |
| DELETE | `/api/notifications/:id` | 删除通知 |
| DELETE | `/api/notifications` | 清空通知 |

#### 系统设置

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/settings` | 获取所有设置 |
| PUT | `/api/settings` | 更新设置 |

### 5.2 WebSocket 事件

```typescript
// 服务端 → 客户端
'hotspot:new'    // { ...hotspot }
'notification'   // { type, title, content, hotspotId, importance }

// 客户端 → 服务端
'subscribe'      // [keyword1, keyword2, ...]
'unsubscribe'    // [keyword1, keyword2, ...]
```

### 5.3 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述信息"
  }
}
```

---

## 六、依赖关系

### 6.1 前端依赖

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "framer-motion": "^11.x",
    "lucide-react": "^0.x",
    "socket.io-client": "^4.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x"
  }
}
```

### 6.2 后端依赖

```json
{
  "dependencies": {
    "express": "^4.x",
    "socket.io": "^4.x",
    "cors": "^2.x",
    "dotenv": "^16.x",
    "node-cron": "^3.x",
    "prisma": "^5.x",
    "@prisma/client": "^5.x",
    "axios": "^1.x",
    "cheerio": "^1.x",
    "nodemailer": "^6.x",
    "@anthropic-ai/sdk": "^0.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "vitest": "^1.x"
  }
}
```

### 6.3 环境变量配置

```env
# 数据库
DATABASE_URL="file:./dev.db"

# 服务器
PORT=3001
CLIENT_URL=http://localhost:5173

# AI 服务（必需）
MINIMAX_API_KEY=your_api_key

# Twitter API（可选）
TWITTER_API_KEY=your_twitter_api_key

# 邮件通知（可选）
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email
SMTP_PASS=your_password
NOTIFY_EMAIL=receive@example.com
```

---

## 七、数据流向图

```
                    ┌─────────────────┐
                    │   用户输入      │
                    │  添加关键词     │
                    └────────┬────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     前端 Client                           │
│  App.tsx ──POST /api/keywords──► keywordsApi.create()   │
└──────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     后端 Server                           │
│  routes/keywords.ts ──prisma.keyword.create()           │
└──────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     SQLite 数据库                          │
│  Keyword 表写入成功                                       │
└──────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                   定时任务 (30分钟)                        │
│  jobs/hotspotChecker.ts                                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Twitter API │  │  Bing 爬虫   │  │  国内平台爬虫 │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └────────────┬────┴──────────────────┘          │
│                      ▼                                    │
│         ┌─────────────────────┐                          │
│         │  去重 + 新鲜度过滤  │                          │
│         │  按来源优先级排序   │                          │
│         └──────────┬──────────┘                          │
│                    ▼                                      │
│         ┌─────────────────────┐                          │
│         │    AI 内容分析      │                          │
│         │  真假 + 相关性评估  │                          │
│         └──────────┬──────────┘                          │
│                    ▼                                      │
│         ┌─────────────────────┐                          │
│         │  过滤 + 保存热点    │                          │
│         │  Hotspot.create()   │                          │
│         └──────────┬──────────┘                          │
│                    │                                      │
│         ┌──────────┴──────────┐                          │
│         ▼                     ▼                          │
│  ┌────────────┐        ┌────────────┐                    │
│  │ WebSocket  │        │   邮件     │                    │
│  │ 推送通知   │        │ (高重要性) │                    │
│  └────────────┘        └────────────┘                    │
└──────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     前端 Client                           │
│  socket.on('hotspot:new') ──► setHotspots() ──► UI 更新 │
│  socket.on('notification') ──► setUnreadCount()         │
└──────────────────────────────────────────────────────────┘
```

---

## 八、核心流程时序图

### 8.1 手动触发热点检查

```
用户点击"立即扫描"
     │
     ▼
POST /api/check-hotspots
     │
     ▼
runHotspotCheck(io)
     │
     ├──► 获取激活关键词列表
     │
     ├──► 遍历每个关键词
     │         │
     │         ├──► detectAndFetchAccount()   // 账号检测
     │         │
     │         ├──► expandKeyword()           // 查询扩展
     │         │
     │         ├──► Promise.allSettled([
     │         │       searchTwitter(),       // Twitter
     │         │       searchBing(),          // Bing
     │         │       searchHackerNews(),    // HN
     │         │       searchSogou(),         // 搜狗
     │         │       searchBilibili(),      // B站
     │         │       searchWeibo()          // 微博
     │         │   ])
     │         │
     │         ├──► deduplicateResults()      // 去重
     │         ├──► filterByFreshness()       // 新鲜度过滤
     │         ├──► prioritizeResults()        // 优先级排序
     │         │
     │         └──► 遍历处理每条结果
     │                   │
     │                   ├──► 检查是否已存在
     │                   ├──► preMatchKeyword()        // 预匹配
     │                   ├──► analyzeContent()         // AI 分析
     │                   │
     │                   ├──► 过滤：isReal === false
     │                   ├──► 过滤：relevance < 50
     │                   │
     │                   └──► hotspot.create()
     │                           │
     │                           ├──► notification.create()
     │                           │
     │                           ├──► io.to('keyword:xxx').emit('hotspot:new')
     │                           │
     │                           ├──► io.emit('notification')
     │                           │
     │                           └──► sendHotspotEmail()  // high/urgent
     │
     ▼
返回 { message: 'Hotspot check completed' }
```

---

## 九、特性亮点

### 9.1 智能查询扩展

通过 AI 将单一关键词扩展为多个变体，提升搜索覆盖率，同时避免泛化引入噪音。

### 9.2 多层级过滤机制

```
原始数据
   │
   ▼
┌───────────────────────────────────┐
│ 第一层：数据源去重                │
│ URL 标准化 + Set 去重            │
└───────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────┐
│ 第二层：新鲜度过滤                │
│ 7 天内的内容保留                 │
└───────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────┐
│ 第三层：来源优先级排序            │
│ Twitter > 微博 > B站 > HN > 搜狗 │
└───────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────┐
│ 第四层：AI 内容分析              │
│ 真假识别 + 相关性评估             │
└───────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────┐
│ 第五层：规则过滤                  │
│ 相关性阈值 + 关键词提及判断       │
└───────────────────────────────────┘
   │
   ▼
高质量热点
```

### 9.3 实时推送 + 邮件双通道

- **WebSocket**：即时推送所有新热点
- **邮件**：仅高重要性（high/urgent）触发，避免信息过载

### 9.4 赛博朋克风格 UI

- 暗色主题 + 霓虹渐变
- 动态粒子背景
- 流畅交互动效
- 响应式布局

---

## 十、部署架构建议

### 10.1 开发环境

```
终端 1: cd server && npm run dev      # :3001
终端 2: cd client && npm run dev       # :5173
```

### 10.2 生产环境建议

| 组件 | 推荐方案 |
|------|----------|
| 后端部署 | PM2 + 负载均衡 |
| 数据库 | 升级至 PostgreSQL |
| 前端静态 | Nginx/CDN |
| 反向代理 | Nginx (HTTPS + 域名) |
| 监控告警 | PM2 Plus / Grafana |

### 10.3 扩展性考虑

| 维度 | 当前实现 | 扩展方向 |
|------|----------|----------|
| 数据源 | 6 个平台 | 可接入更多社交媒体 |
| AI 模型 | MiniMax-M2.5 | 支持切换 Claude/GPT |
| 存储 | SQLite | 支持 PostgreSQL/MySQL |
| 通知 | WebSocket + 邮件 | 可接入钉钉/飞书/Slack |

---

## 十一、文档对照索引

本文档基于以下 `docs/` 目录原始文档整合：

| 原始文档 | 覆盖内容 |
|----------|----------|
| `README.md` | 项目概述、技术栈、项目结构、配置说明 |
| `REQUIREMENTS.md` | 功能需求、数据源规格、AI 分析规格、接口设计 |
| `API_INTEGRATION.md` | 各 API 集成方式、数据库 Schema、路由配置 |
| `LOCAL_SETUP.md` | 环境配置、部署流程、常见问题 |

---

> 本文档由 AI 自动生成，完整呈现 HotPulse 项目的架构设计与功能逻辑，供开发维护参考。
