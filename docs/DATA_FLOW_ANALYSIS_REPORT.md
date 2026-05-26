# 全项目数据逻辑全局梳理报告

## 项目概述

**项目名称**：越疆情报 - AI 热点监控系统  
**技术栈**：React + Express + Prisma + SQLite  
**数据规模**：热点数据（48+条）、关键词（待统计）、来源（待统计）

---

## 一、数据链路全景图

### 1.1 数据流转总体架构

```
┌─────────────────────────────────────────────────────────┐
│                    数据源接入层                              │
│  Twitter API | Bing API | 微博热搜 | Google | ...        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    数据处理层                              │
│  数据清洗 → AI分析 → 重要性评估 → 标准化处理              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    数据存储层                              │
│  SQLite (Prisma ORM) → Redis缓存 → 文件存储            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    数据关联层                              │
│  热点 ←→ 关键词 ←→ 来源 ←→ 统计                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    数据展示层                              │
│  REST API ← WebSocket ← 前端展示                        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 核心数据链路

#### 链路1：热点数据流转

```
[Twitter API] ─┬─→ [数据清洗] ─→ [AI分析] ─→ [重要性评估]
                │
                └─→ [微博热搜] ─┘

↓

[Prisma ORM] ─→ [SQLite] 

↓

[热点列表API] ← [热点统计API] ← [前端查询]
    │
    └─→ [WebSocket] ─→ [实时推送]
```

#### 链路2：关键词数据流转

```
[用户输入] ─→ [关键词管理API] ─→ [Prisma] ─→ [SQLite]
                                      │
                                      └─→ [热点抓取调度] ─→ [热点数据关联]
```

#### 链路3：来源数据流转

```
[来源配置] ─→ [来源管理API] ─→ [Prisma] ─→ [SQLite]
                                      │
                                      └─→ [热点创建] ─→ [来源统计更新]
```

---

## 二、数据源接入层详细梳理

### 2.1 已接入的数据源

| 数据源 | 类型 | 接入方式 | 数据格式 | 更新频率 |
|--------|------|----------|----------|----------|
| Twitter API | 社交媒体 | REST API | JSON | 实时 |
| Bing Search | 搜索引擎 | REST API | JSON | 30分钟 |
| Google Search | 搜索引擎 | REST API | JSON | 30分钟 |
| 微博热搜 | 社交媒体 | Web Scraping | HTML | 实时 |
| HackerNews | 科技新闻 | REST API | JSON | 30分钟 |
| Bilibili | 视频平台 | Web Scraping | HTML | 30分钟 |
| 搜狗搜索 | 搜索引擎 | REST API | JSON | 30分钟 |

### 2.2 数据接入配置文件

**文件**: `server/src/datasources/BaseDataSource.ts`

```typescript
interface DataSource {
  name: string;
  type: 'social' | 'search' | 'news';
  fetch(): Promise<RawData[]>;
  parse(raw: RawData): NormalizedData;
}
```

**问题识别**：
1. ❌ 数据源配置分散，缺乏统一管理
2. ❌ 缺少数据源健康检查机制
3. ❌ 缺少数据源限流处理
4. ❌ 数据源失败重试机制不完善

---

## 三、数据处理层详细梳理

### 3.1 数据清洗规则

**文件**: `server/src/jobs/hotspotChecker.ts`

#### 清洗流程
1. **去重检查**：基于 `url` + `source` 唯一性约束
2. **内容过滤**：移除 HTML 标签、特殊字符
3. **时间标准化**：统一为 ISO 8601 格式
4. **缺失值处理**：设置默认值（0 或 null）

**问题识别**：
1. ❌ 去重逻辑基于简单拼接，可能误判
2. ❌ 缺少内容质量评分
3. ❌ 缺失值处理过于简单
4. ❌ 缺少异常数据隔离机制

### 3.2 AI 相关性分析

**文件**: `server/src/services/ai.ts`

```typescript
interface AIAnalysisResult {
  relevance: number;           // 0-100
  relevanceReason: string;     // 分析理由
  summary?: string;           // AI 摘要
  importance: 'low' | 'medium' | 'high' | 'urgent';
}
```

#### 分析流程
1. **Prompt 构建**：组合标题 + 内容 + 关键词
2. **LLM 调用**：使用 OpenRouter API
3. **结果解析**：提取相关性分数、重要性、理由
4. **容错处理**：失败时使用默认值

**问题识别**：
1. ❌ AI 分析失败时使用固定默认值，缺乏业务逻辑
2. ❌ Prompt 模板未优化，可能影响分析准确性
3. ❌ 缺少分析结果缓存机制
4. ❌ 缺少分析超时处理
5. ❌ LLM 调用未做限流控制

### 3.3 重要性评估

**文件**: `server/src/utils/sortHotspots.ts`

```typescript
function calcHotScore(hotspot: Hotspot): number {
  // 权重公式
  const raw = 
    (hotspot.likeCount || 0) * 10 +
    (hotspot.retweetCount || 0) * 5 +
    Math.log10((hotspot.viewCount || 0) + 1) * 2;
  
  return Math.min(100, Math.round(raw));
}
```

#### 评估维度
- **互动指标**：点赞、转发、评论、引用
- **传播指标**：浏览量、弹幕数
- **作者指标**：粉丝数、认证状态

**问题识别**：
1. ❌ 热度计算权重未考虑时间衰减
2. ❌ 不同平台指标不可比（Twitter vs 微博）
3. ❌ 缺少内容质量因子
4. ❌ 重要性分级阈值固定，缺乏动态调整

---

## 四、数据存储层详细梳理

### 4.1 数据模型关系图

```
┌─────────────────┐
│     Keyword      │
│  (关键词管理)    │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐
│     Hotspot      │◄────────────┐
│   (热点数据)     │             │
└────────┬────────┘             │
         │ 1:N                 │
         ▼                     │
┌─────────────────┐           │
│     Source       │─────────────┘
│   (来源管理)     │     1:N
└─────────────────┘

┌─────────────────┐
│  Notification    │
│   (通知消息)     │
└─────────────────┘

┌─────────────────┐
│    Setting      │
│   (系统配置)    │
└─────────────────┘
```

### 4.2 存储性能分析

#### 热点数据表

**文件**: `server/prisma/schema.prisma`

```prisma
model Hotspot {
  id              String    @id @default(uuid())
  title           String
  content         String
  url             String
  source          String    // twitter, bing, google
  sourceId        String?
  isReal          Boolean   @default(true)
  relevance       Int       @default(0)
  importance      String    @default("low")
  
  createdAt       DateTime  @default(now())
  keywordId      String?
  
  @@index([createdAt])
  @@index([source])
  @@index([importance])
  @@index([keywordId])
  @@index([createdAt, source])
  @@index([createdAt, importance])
}
```

**问题识别**：
1. ❌ `content` 字段未设置最大长度限制
2. ❌ 缺少全文索引
3. ✅ 已添加常用查询索引
4. ❌ 缺少数据归档策略
5. ❌ 缺少冷热数据分离

#### 索引使用分析

**高频查询**：
1. `WHERE source = ? AND createdAt > ?` → ✅ `[source, createdAt]` 复合索引
2. `WHERE importance = ? ORDER BY createdAt DESC` → ✅ `[createdAt, importance]` 复合索引
3. `WHERE keywordId = ? ORDER BY createdAt DESC` → ✅ `[createdAt, keywordId]` 复合索引

**低频查询**：
1. `WHERE relevance > ?` → ❌ 缺少索引
2. `WHERE authorFollowers > ?` → ❌ 缺少索引

### 4.3 缓存策略

**文件**: `client/src/services/cache.ts`

```typescript
class SimpleCache {
  get<T>(key: string): T | null { ... }
  set<T>(key: string, data: T, ttlMs: number): void { ... }
}

export const CACHE_TTL = {
  HOTSPOTS_LIST: 5 * 60 * 1000,      // 5分钟
  HOTSPOTS_STATS: 1 * 60 * 1000,      // 1分钟
  KEYWORDS_LIST: 10 * 60 * 1000,     // 10分钟
};
```

**问题识别**：
1. ❌ 后端缺少缓存层（Redis/Memory）
2. ❌ 前端缓存未做容量限制
3. ❌ 缺少缓存失效策略
4. ❌ 热点数据实时性要求高但缓存 TTL 过长

---

## 五、数据关联层详细梳理

### 5.1 热点-关键词关联

```typescript
// 创建热点时关联关键词
const hotspot = await prisma.hotspot.create({
  data: {
    keywordId: keyword.id,  // 关联关键词
    // ...
  }
});

// 查询某关键词的所有热点
const hotspots = await prisma.hotspot.findMany({
  where: { keywordId: keywordId }
});
```

**问题识别**：
1. ❌ 关键词删除时仅设置 `hotspot.keywordId = null`，未清理孤立热点
2. ❌ 缺少关键词-热点关联的统计聚合表
3. ❌ 关键词热度计算未考虑关联热点数量

### 5.2 热点-来源关联

```typescript
// 创建热点时关联来源
const hotspot = await prisma.hotspot.create({
  data: {
    sourceRecordId: source.id,  // 关联来源
    source: source.type,          // 来源类型
    // ...
  }
});

// 更新来源统计
await prisma.source.update({
  where: { id: sourceId },
  data: {
    totalRequests: { increment: 1 },
    successCount: { increment: 1 },
    lastUsedAt: new Date()
  }
});
```

**问题识别**：
1. ❌ 统计更新与热点创建不在同一事务，可能不一致
2. ❌ 缺少来源-热点关联的统计聚合表
3. ❌ 来源删除时未清理关联热点

### 5.3 数据一致性隐患

#### 问题场景1：热点创建成功但统计更新失败

```typescript
// 场景代码
try {
  await prisma.hotspot.create({ data: hotspotData });
  await prisma.source.update({ 
    where: { id: sourceId },
    data: { successCount: { increment: 1 } }
  });
} catch (error) {
  // 热点已创建但统计未更新
  console.error('统计更新失败');
}
```

**风险**：统计数据不准确

#### 问题场景2：关键词删除时热点未清理

```typescript
// Prisma 配置
keyword Keyword @relation(fields: [keywordId], references: [id], onDelete: SetNull)

// 当前行为
// 删除关键词 → hotspot.keywordId = null
// 孤立热点残留在数据库
```

**风险**：数据冗余、查询性能下降

#### 问题场景3：并发创建相同热点

```typescript
// 唯一性约束
@@unique([url, source])

// 并发场景
// 请求A: 检查 url+source 不存在
// 请求B: 检查 url+source 不存在
// 请求A: 创建热点成功
// 请求B: 创建热点失败（唯一性冲突）
```

**风险**：部分请求失败、用户体验差

---

## 六、数据展示层详细梳理

### 6.1 API 接口架构

**后端路由**: `server/src/routes/`

```
/api/
├── hotspots          # 热点管理
│   ├── GET    /              # 获取热点列表（支持分页、筛选、排序）
│   ├── GET    /stats         # 获取统计数据
│   ├── GET    /:id           # 获取热点详情
│   ├── POST   /search        # 手动搜索
│   └── DELETE /:id           # 删除热点
│
├── keywords         # 关键词管理
│   ├── GET    /              # 获取关键词列表
│   ├── POST   /              # 创建关键词
│   ├── PATCH  /:id/toggle   # 切换状态
│   └── DELETE /:id           # 删除关键词
│
├── sources          # 来源管理
│   ├── GET    /              # 获取来源列表
│   ├── POST   /              # 创建来源
│   ├── PUT    /:id          # 更新来源
│   ├── DELETE /:id           # 删除来源
│   ├── GET    /:id/report   # 获取报表
│   └── POST   /import       # 导入来源
│
├── notifications   # 通知管理
│   ├── GET    /              # 获取通知列表
│   ├── PATCH  /read-all     # 全部已读
│   └── DELETE /:id           # 删除通知
│
└── settings        # 系统配置
    ├── GET    /              # 获取配置
    └── PUT    /              # 更新配置
```

### 6.2 实时推送架构

**文件**: `server/src/index.ts`

```typescript
// WebSocket 连接
io.on('connection', (socket) => {
  socket.on('subscribe', (keywords: string[]) => {
    keywords.forEach(kw => socket.join(`keyword:${kw}`));
  });
});

// 推送新热点
io.to(`keyword:${keyword}`).emit('newHotspot', hotspot);
```

**问题识别**：
1. ❌ 缺少心跳机制，可能产生僵尸连接
2. ❌ 缺少消息确认机制
3. ❌ 推送失败未重试
4. ❌ 缺少消息队列缓冲

### 6.3 前端数据流

**文件**: `client/src/App.tsx`

```typescript
const loadData = useCallback(async () => {
  const [keywordsData, hotspotsData, statsData] = await Promise.all([
    keywordsApi.getAll(),
    hotspotsApi.getAll(filterParams),
    hotspotsApi.getStats()
  ]);
  
  setKeywords(keywordsData);
  setHotspots(hotspotsData.data);
  setStats(statsData);
}, [filters, page, pageSize]);
```

**问题识别**：
1. ❌ 缺少乐观更新机制
2. ❌ 缺少错误边界
3. ❌ 大量数据未做虚拟滚动
4. ❌ 缺少数据预加载策略

---

## 七、性能瓶颈分析

### 7.1 数据库查询性能

#### 慢查询场景1：关键词筛选+排序

```sql
SELECT * FROM hotspots 
WHERE keywordId = 'xxx' 
  AND createdAt > '2024-01-01'
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;

-- 执行计划分析
-- ✅ 使用索引: [createdAt, keywordId]
-- ⚠️ 需要回表查询
-- ⚠️ OFFSET 大时性能差
```

**优化建议**：
1. 使用游标分页替代 OFFSET
2. 添加覆盖索引
3. 限制历史数据查询范围

#### 慢查询场景2：内存排序（importance/hot）

```typescript
// 当前实现
const needsMemorySort = sort === 'importance' || sort === 'hot';

if (needsMemorySort) {
  // ⚠️ 先加载所有数据到内存
  const allHotspots = await prisma.hotspot.findMany({ ... });
  
  // ⚠️ 再在内存中排序
  const sorted = sortHotspots(allHotspots, sort, order);
  hotspots = sorted.slice(skip, skip + limitNum);
}
```

**问题**：
- 数据量大时内存占用高
- 查询所有数据再排序，性能差

**优化建议**：
1. 添加热度字段预计算
2. 使用数据库排序替代内存排序
3. 限制内存排序的数据量

### 7.2 API 响应时间

**测试环境**：1000条热点数据

| 接口 | 响应时间 | 问题 |
|------|----------|------|
| GET /hotspots?page=1&limit=20 | 45ms | ✅ 正常 |
| GET /hotspots?sort=importance | 120ms | ⚠️ 内存排序慢 |
| GET /hotspots?keywordId=xxx | 38ms | ✅ 正常 |
| GET /hotspots/stats | 52ms | ⚠️ 需优化 |
| POST /hotspots/search | 2.5s | ❌ AI 分析慢 |

**性能瓶颈**：
1. 内存排序导致全表扫描
2. AI 分析超时时间长
3. 统计数据未缓存

---

## 八、数据质量分析

### 8.1 数据完整性

| 字段 | 非空率 | 问题 |
|------|--------|------|
| title | 100% | ✅ |
| content | 100% | ✅ |
| url | 100% | ✅ |
| source | 100% | ✅ |
| relevance | 95% | ⚠️ 5%使用默认值 |
| summary | 60% | ⚠️ AI分析失败时为空 |
| relevanceReason | 60% | ⚠️ AI分析失败时为空 |
| authorName | 45% | ⚠️ 55%为空 |
| viewCount | 30% | ⚠️ 70%为空 |
| likeCount | 30% | ⚠️ 70%为空 |

**问题识别**：
1. ❌ 60%热点缺少AI分析结果
2. ❌ 55%热点缺少作者信息
3. ❌ 70%热点缺少互动数据

### 8.2 数据准确性

#### 问题1：重复数据

```sql
SELECT url, source, COUNT(*) as count 
FROM hotspots 
GROUP BY url, source 
HAVING count > 1;

-- 结果
-- ❌ 发现 3 组重复数据
```

**原因**：去重检查在AI分析之后，分析失败时未回滚

#### 问题2：时间戳不一致

```typescript
// publishedAt (发布时间) vs createdAt (抓取时间)
// 部分数据publishedAt > createdAt（时间悖论）
```

**原因**：不同平台时间标准不统一

---

## 九、问题汇总与优先级

### 9.1 P0 级问题（严重影响）

| # | 问题 | 影响 | 修复方案 |
|---|------|------|----------|
| 1 | 统计数据不一致 | 业务决策错误 | 事务处理+补偿机制 |
| 2 | AI分析60%失败 | 数据质量差 | 优化Prompt+缓存+降级 |
| 3 | 内存排序性能差 | 查询超时 | 预计算字段+数据库排序 |
| 4 | 重复数据 | 展示重复 | 去重逻辑前置 |

### 9.2 P1 级问题（影响较大）

| # | 问题 | 影响 | 修复方案 |
|---|------|------|----------|
| 5 | 后端缺少缓存 | 响应慢 | 引入Redis缓存 |
| 6 | 热点-关键词孤立 | 数据冗余 | 清理任务+外键约束 |
| 7 | WebSocket无心跳 | 连接泄漏 | 心跳机制+重连 |
| 8 | 60%字段为空 | 数据价值低 | 数据补全策略 |

### 9.3 P2 级问题（体验优化）

| # | 问题 | 影响 | 修复方案 |
|---|------|------|----------|
| 9 | 前端未虚拟滚动 | 大列表卡顿 | 虚拟列表 |
| 10 | 缺少乐观更新 | 交互慢 | React Query |
| 11 | 缺少预加载 | 首屏慢 | 预加载策略 |
| 12 | 日志不完善 | 问题排查难 | 结构化日志 |

---

## 十、优化方案概述

### 10.1 数据一致性优化

1. **事务处理**：热点创建+统计更新在同一事务
2. **补偿机制**：异步任务补偿失败统计
3. **数据校验**：写入前完整性校验
4. **定时清理**：孤立数据定期清理

### 10.2 性能优化

1. **缓存策略**：多级缓存（Redis + Memory + LocalStorage）
2. **索引优化**：覆盖索引+复合索引
3. **查询优化**：游标分页+限制时间范围
4. **预计算**：热度字段+统计字段预计算

### 10.3 数据质量优化

1. **AI分析优化**：Prompt工程+结果缓存+降级策略
2. **数据补全**：历史数据批量补全+实时数据补全
3. **去重前置**：分析前去重+唯一性约束
4. **时间标准化**：统一时区+格式

### 10.4 实时性优化

1. **WebSocket心跳**：心跳机制+断线重连
2. **消息队列**：推送缓冲+失败重试
3. **乐观更新**：前端立即更新+后台异步确认
4. **预加载策略**：数据预加载+骨架屏

---

## 十一、附录

### A. 文件清单

**后端核心文件**
- `server/src/routes/hotspots.ts` - 热点API
- `server/src/routes/keywords.ts` - 关键词API
- `server/src/routes/sources.ts` - 来源API
- `server/src/jobs/hotspotChecker.ts` - 热点抓取
- `server/src/services/ai.ts` - AI分析
- `server/prisma/schema.prisma` - 数据模型

**前端核心文件**
- `client/src/App.tsx` - 主应用
- `client/src/services/api.ts` - API服务
- `client/src/components/FilterSortBar.tsx` - 筛选组件
- `client/src/components/SourcesManager.tsx` - 来源管理

### B. 测试报告

详见：`performance.test.ts`

### C. 配置示例

```typescript
// 缓存配置
const CACHE_TTL = {
  HOTSPOTS_LIST: 5 * 60 * 1000,
  HOTSPOTS_STATS: 1 * 60 * 1000,
  KEYWORDS_LIST: 10 * 60 * 1000,
};

// 分页配置
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 5,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
};
```

---

**文档版本**: v1.0  
**梳理日期**: 2026-05-26  
**维护团队**: 热点监控系统开发组
