# 全系统数据查重逻辑全面排查与梳理报告

## 一、项目概述与业务场景分析

### 1.1 项目背景

**项目名称**：AI 热点监控系统（yupi-hot-monitor）

**核心功能**：从 Twitter、Bing、HackerNews、搜狗、B站、微博、微信等 8+ 个信息源聚合抓取内容，利用 AI 进行真假识别和相关性分析，并通过 WebSocket 实时推送和邮件通知用户。

**技术栈**：
- 前端：React 19 + TypeScript + Vite
- 后端：Express 5 + Prisma + SQLite
- 缓存：Redis
- AI 服务：OpenRouter

### 1.2 核心业务模块范围

本系统涉及数据录入、数据导入、数据同步及批量处理的核心业务模块如下：

#### 模块1：热点采集模块（hotspotChecker.ts）
- **职责**：定时扫描关键词，从多个数据源抓取热点
- **数据流向**：数据源 → 去重 → AI分析 → 数据库 → 通知推送
- **核心操作**：创建热点、更新通知、实时去重

#### 模块2：来源管理模块（sources.ts）
- **职责**：管理外部数据来源配置（Twitter API、Bing API等）
- **核心操作**：CRUD来源记录、导入导出配置

#### 模块3：关键词管理模块（keywords.ts）
- **职责**：管理监控关键词
- **核心操作**：CRUD关键词记录

#### 模块4：通知管理模块（notifications.ts）
- **职责**：管理热点通知
- **核心操作**：创建通知、标记已读、清理过期通知

#### 模块5：数据清理模块（duplicateCleanup.ts）
- **职责**：定期清理重复和过期数据
- **核心操作**：软去重、旧数据清理、来源去重

#### 模块6：数据源管理模块（DataSourceManager.ts）
- **职责**：统一管理各类数据源的配置和运行状态
- **核心操作**：注册数据源、配置管理、健康检查

---

## 二、数据查重规则全景分布图

### 2.1 规则分布总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据查重规则分布总览                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   L1 数据源层    │    │   L2 应用层      │                   │
│  │                  │    │                  │                   │
│  │ • URL去重        │    │ • Redis缓存去重  │                   │
│  │ • 内容验证       │    │ • 数据库查重     │                   │
│  │ • 格式校验       │    │ • AI分析过滤     │                   │
│  │ • 频率限制       │    │ • 阈值过滤       │                   │
│  └──────────────────┘    └──────────────────┘                   │
│           ↓                      ↓                              │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   L3 持久化层   │    │   L4 API层       │                   │
│  │                  │    │                  │                   │
│  │ • 唯一约束      │    │ • 参数验证       │                   │
│  │ • 索引优化      │    │ • 分页限制       │                   │
│  │ • 事务保证      │    │ • 权限检查       │                   │
│  │ • Upsert防重    │    │ • 业务规则校验   │                   │
│  └──────────────────┘    └──────────────────┘                   │
│           ↓                      ↓                              │
│  ┌──────────────────────────────────────────┐                   │
│  │              L5 清理层                    │                   │
│  │                                           │                   │
│  │  • 定时软去重（24小时）                   │                   │
│  │  • 过期数据清理（30天）                    │                   │
│  │  • 来源重复清理                           │                   │
│  │  • 永久缓存设置                          │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 各模块查重规则详细分布

#### 表2.2.1 热点采集模块查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| HR-01 | Redis缓存去重 | hotspotChecker.ts:23-92 | 每次采集时 | `source + title` | 跳过 | P0 |
| HR-02 | 数据库查重 | hotspotChecker.ts:48-55 | Redis未命中时 | `url + source` OR `title + source` | 跳过 | P0 |
| HR-03 | 唯一约束兜底 | hotspotChecker.ts:356-362 | Upsert时 | Prisma P2002错误码 | 捕获异常跳过 | P0 |
| HR-04 | 新鲜度过滤 | hotspotChecker.ts:100-119 | 采集后 | `publishedAt < 7天前` | 跳过 | P1 |
| HR-05 | AI真实性过滤 | hotspotChecker.ts:296-299 | 保存前 | `isReal === false` | 跳过 | P0 |
| HR-06 | 相关性阈值过滤 | hotspotChecker.ts:302-311 | 保存前 | `relevance < 50` 或 `keywordMentioned === false && relevance < 65` | 跳过 | P1 |
| HR-07 | 实时软去重 | hotspotChecker.ts:143-179 | 保存后 | `title + source` | 删除旧记录 | P2 |
| HR-08 | 通知去重 | hotspotChecker.ts:378-392 | 保存后 | `hotspotId` 存在 | 跳过 | P1 |

#### 表2.2.2 来源管理模块查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| SR-01 | name唯一性约束 | schema.prisma:25 | 创建/更新时 | Prisma P2002错误码 | 拒绝并返回错误 | P0 |
| SR-02 | type唯一性校验 | sources.ts:475-515 | 导入前 | 数据库查询 `type` | 拒绝并返回错误 | P0 |
| SR-03 | 内部type重复检查 | sources.ts:476-498 | 导入前 | `typeCount > 1` | 拒绝并返回错误 | P0 |
| SR-04 | type索引 | schema.prisma:51 | 查询优化 | - | 性能优化 | P3 |

#### 表2.2.3 关键词管理模块查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| KR-01 | text唯一性约束 | schema.prisma:15 | 创建时 | Prisma P2002错误码 | 拒绝并返回409 | P0 |
| KR-02 | 长度验证 | keywords.ts:53-55 | 创建前 | `text.trim().length === 0` | 拒绝并返回400 | P1 |

#### 表2.2.4 通知管理模块查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| NR-01 | hotspotId唯一性 | hotspots.ts:378-392 | 创建前 | 数据库查询 `hotspotId` | 跳过创建 | P1 |
| NR-02 | 过期通知清理 | notificationCleanup.ts | 定时任务 | `createdAt < 30天前` | 删除 | P2 |

#### 表2.2.5 数据清理模块查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| CR-01 | 来源重复清理 | duplicateCleanup.ts:50-91 | 每周日凌晨3点 | `GROUP BY type HAVING COUNT(*) > 1` | 删除保留MIN(id) | P2 |
| CR-02 | 热点软重复清理 | duplicateCleanup.ts:93-160 | 每周日凌晨3点 | `createdAt >= 24h && GROUP BY title, source` | 删除保留最新 | P2 |
| CR-03 | 过期数据清理 | duplicateCleanup.ts:162-212 | 每周日凌晨3点 | `createdAt < 30天前 && importance NOT IN ('high', 'urgent')` | 删除+设置永久缓存 | P2 |

#### 表2.2.6 搜索服务层查重规则

| 规则ID | 规则名称 | 部署位置 | 触发条件 | 判断依据 | 处理方式 | 优先级 |
|--------|---------|---------|---------|---------|---------|--------|
| SS-01 | URL标准化去重 | search.ts:318-329 | 聚合搜索前 | 标准化URL（去除尾部斜杠、www前缀） | 过滤重复 | P1 |
| SS-02 | 频率限制 | search.ts:33-36, chinaSearch.ts:32-35 | 每次请求 | 时间窗口控制 | 延迟请求 | P2 |
| SS-03 | 内容可用性检查 | chinaSearch.ts:474-515 | 微信搜索后 | 检测屏蔽关键词 | 过滤不可用内容 | P1 |

---

## 三、核心查重逻辑详细分析

### 3.1 热点采集去重机制

#### 3.1.1 三层防护体系

**第一层：Redis缓存去重**（hotspotChecker.ts:23-92）
```typescript
async function deduplicateWithCache(results, keywordId) {
  for (const item of results) {
    const cacheKey = `${DEDUP_CACHE_PREFIX}${item.source}:${item.title}`;
    
    // 1. 检查Redis缓存
    const cached = await redis.get(cacheKey);
    if (cached) continue; // 命中，跳过
    
    // 2. 检查数据库（兜底）
    const existing = await prisma.hotspot.findFirst({
      where: {
        OR: [
          { url: item.url, source: item.source },
          { title: item.title, source: item.source }
        ]
      }
    });
    if (existing) {
      await redis.setEx(cacheKey, CACHE_EXPIRE_SECONDS, '1');
      continue;
    }
    
    // 3. 添加到结果集
    dedupedResults.push(item);
    await redis.setEx(cacheKey, CACHE_EXPIRE_SECONDS, '1');
  }
}
```

**关键参数**：
- 缓存键格式：`hotspot:dedup:{source}:{title}`
- 缓存过期时间：24小时（`CACHE_EXPIRE_SECONDS = 24 * 60 * 60`）
- 去重依据：`(source + title)` 组合

**第二层：数据库唯一约束**（schema.prisma:89-90）
```prisma
model Hotspot {
  @@unique([url, source])
  @@unique([title, source])
}
```

**关键约束**：
- 硬重复：`url + source` 组合唯一
- 软重复：`title + source` 组合唯一

**第三层：Upsert原子操作**（hotspotChecker.ts:317-363）
```typescript
const hotspot = await prisma.hotspot.upsert({
  where: {
    url_source: { url: item.url, source: item.source }
  },
  create: { /* ... */ },
  update: {} // 已存在则不更新
});
```

**关键特性**：
- 原子操作，避免并发竞态
- 返回已存在记录或新建记录
- 异常捕获P2002错误码作为最后防线

#### 3.1.2 实时软去重机制

**触发时机**：每次成功插入热点后
**清理策略**：保留最新插入的记录，删除同标题+来源的旧记录
**缓存处理**：清理Redis缓存，允许24小时后重新抓取

```typescript
async function cleanupRecentDuplicates(newestId, title, source) {
  await prisma.hotspot.deleteMany({
    where: {
      title,
      source,
      NOT: { id: newestId }
    }
  });
  // 清理缓存，允许24小时后重新抓取
  await redis.del(`${DEDUP_CACHE_PREFIX}${source}:${title}`);
}
```

### 3.2 来源管理去重机制

#### 3.2.1 导入前双重校验

**第一层：内部重复检查**（sources.ts:476-498）
```typescript
const typeCount = new Map<string, number>();
for (const source of sources) {
  typeCount.set(source.type, (typeCount.get(source.type) || 0) + 1);
}

const internalTypeDuplicates = [...typeCount.entries()]
  .filter(([_, count]) => count > 1)
  .map(([type]) => type);

if (internalTypeDuplicates.length > 0) {
  return res.status(400).json({ 
    error: 'IMPORT_TYPE_DUPLICATE',
    duplicateTypes: internalTypeDuplicates
  });
}
```

**第二层：与现有数据冲突检查**（sources.ts:501-515）
```typescript
for (const [type] of typeCount) {
  const existing = await prisma.source.findFirst({ where: { type } });
  if (existing) {
    return res.status(400).json({ 
      error: 'IMPORT_TYPE_EXISTS',
      existingSource: { id: existing.id, name: existing.name, type: existing.type }
    });
  }
}
```

#### 3.2.2 创建时的唯一性约束

**数据库约束**：
```prisma
model Source {
  name String @unique  // ✅ 硬性约束
  type String          // ❌ 无数据库约束
}
```

**问题识别**：`type`字段缺少数据库唯一约束，仅依靠应用层校验

### 3.3 关键词管理去重机制

**唯一约束**：
```prisma
model Keyword {
  text String @unique  // ✅ 完全匹配，大小写敏感
}
```

**问题识别**：
- 大小写敏感：`"AI"` 和 `"ai"` 被视为不同关键词
- 无规范化处理

---

## 四、数据库索引与约束配置分析

### 4.1 Prisma Schema 约束配置

#### 表4.1.1 Keyword表

```prisma
model Keyword {
  id        String    @id @default(uuid())
  text      String    @unique        // ✅ 唯一约束
  category  String?
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  hotspots  Hotspot[]
  
  // 无额外索引
}
```

**约束情况**：
- ✅ `text` 有唯一约束
- ✅ 主键自动索引
- ⚠️  无业务查询优化索引（如 `isActive`、`category`）

**查询模式分析**：
```typescript
// 活跃关键词查询
await prisma.keyword.findMany({
  where: { isActive: true }  // ❌ 无索引优化
});
```

**优化建议**：
```prisma
model Keyword {
  // ...
  @@index([isActive])  // 优化活跃关键词查询
}
```

#### 表4.1.2 Source表

```prisma
model Source {
  id            String    @id @default(uuid())
  name          String    @unique    // ✅ 唯一约束
  type          String               // ❌ 无唯一约束
  dataSourceId  String
  category      String?
  status        String    @default("active")
  priority      Int       @default(0)
  description   String?
  config        String?
  credentials   String?
  
  // 统计信息
  totalRequests Int       @default(0)
  successCount Int       @default(0)
  errorCount   Int       @default(0)
  lastUsedAt   DateTime?
  
  // 权限配置
  isPublic     Boolean   @default(true)
  allowedRoles String?
  
  // 关联
  hotspots     Hotspot[]
  
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  
  @@index([type])           // ✅ 优化type查询
  @@index([dataSourceId])   // ✅ 优化dataSourceId查询
  @@index([category])       // ✅ 优化category查询
  @@index([status])         // ✅ 优化status查询
}
```

**约束情况**：
- ✅ `name` 有唯一约束
- ❌ `type` 无唯一约束（仅应用层校验）
- ✅ `dataSourceId`、`type`、`category`、`status` 均有索引
- ⚠️  `dataSourceId` 既是字段又是索引，可能导致混淆

**优化建议**：
```prisma
model Source {
  // ...
  // 如果业务确实需要type唯一，添加约束
  // 但需注意：删除来源后是否允许同名type？
  // @@unique([type])  // 需评估业务影响
}
```

#### 表4.1.3 Hotspot表

```prisma
model Hotspot {
  id              String    @id @default(uuid())
  title           String
  content         String
  url             String
  source          String
  sourceId        String?
  isReal          Boolean   @default(true)
  relevance       Int       @default(0)
  relevanceReason String?
  keywordMentioned Boolean?
  importance      String    @default("low")
  summary         String?
  viewCount       Int?
  likeCount       Int?
  retweetCount    Int?
  replyCount      Int?
  commentCount    Int?
  quoteCount      Int?
  danmakuCount    Int?
  authorName      String?
  authorUsername  String?
  authorAvatar    String?
  authorFollowers Int?
  authorVerified  Boolean?
  publishedAt     DateTime?
  createdAt       DateTime  @default(now())
  keywordId       String?
  keyword         Keyword?  @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  sourceRecordId  String?
  sourceRecord    Source?   @relation(fields: [sourceRecordId], references: [id], onDelete: SetNull)

  @@unique([url, source])       // ✅ 硬重复唯一约束
  @@unique([title, source])     // ✅ 软重复唯一约束
  @@index([source])             // ✅ 优化source查询
  @@index([importance])         // ✅ 优化importance查询
  @@index([keywordId])          // ✅ 优化keywordId查询
  @@index([sourceRecordId])     // ✅ 优化sourceRecordId查询
  @@index([createdAt, source])  // ✅ 复合索引：时间+来源
  @@index([createdAt, importance])  // ✅ 复合索引：时间+重要性
  @@index([createdAt, keywordId])   // ✅ 复合索引：时间+关键词
}
```

**约束情况**：
- ✅ `url + source` 有复合唯一约束（硬重复）
- ✅ `title + source` 有复合唯一约束（软重复）
- ✅ 7个单字段和复合索引，覆盖主要查询模式
- ⚠️  缺少 `publishedAt` 索引（新鲜度过滤可能慢）

**索引使用分析**：

```typescript
// 场景1：按来源和创建时间查询
await prisma.hotspot.findMany({
  where: { source: 'twitter', createdAt: { gte: sevenDaysAgo } }
});
// ✅ 使用 @@index([createdAt, source])

// 场景2：查询某关键词的所有热点
await prisma.hotspot.findMany({
  where: { keywordId: 'xxx', createdAt: { gte: sevenDaysAgo } }
});
// ✅ 使用 @@index([createdAt, keywordId])

// 场景3：查询高重要性的热点
await prisma.hotspot.findMany({
  where: { importance: { in: ['high', 'urgent'] }, createdAt: { gte: sevenDaysAgo } }
});
// ✅ 使用 @@index([createdAt, importance]) 或 @@index([importance])
```

**优化建议**：
```prisma
model Hotspot {
  // ...
  @@index([publishedAt])  // 优化新鲜度过滤查询
}
```

#### 表4.1.4 Notification表

```prisma
model Notification {
  id        String   @id @default(uuid())
  type      String
  title     String
  content   String
  isRead    Boolean  @default(false)
  hotspotId String?
  createdAt DateTime @default(now())

  @@index([isRead, createdAt])  // ✅ 复合索引：未读+时间
}
```

**约束情况**：
- ❌ `hotspotId` 无唯一约束（可能重复通知）
- ✅ `isRead + createdAt` 有复合索引

**优化建议**：
```prisma
model Notification {
  // hotspotId应该是唯一的（一个热点一个通知）
  hotspotId String?   @unique  // 添加唯一约束
}
```

#### 表4.1.5 Setting表

```prisma
model Setting {
  id    String @id @default(uuid())
  key   String @unique  // ✅ 唯一约束
  value String
}
```

### 4.2 索引覆盖度分析

| 表名 | 字段数 | 唯一约束数 | 索引数 | 覆盖查询场景数 | 缺失场景 |
|------|--------|-----------|--------|--------------|---------|
| Keyword | 6 | 1 | 0 | 1 | isActive查询 |
| Source | 14 | 1 | 4 | 5 | - |
| Hotspot | 30 | 2 | 7 | 12 | publishedAt查询 |
| Notification | 6 | 0 | 1 | 1 | hotspotId查询 |
| Setting | 3 | 1 | 0 | 1 | - |

---

## 五、潜在问题全面识别

### 5.1 漏判风险分析

#### 🔴 P0级漏判

**问题1：并发竞态条件下的重复插入**
- **位置**：hotspotChecker.ts:148-159
- **场景**：两个关键词同时抓取相同URL
- **原因**：查重与插入不是原子操作
- **影响**：可能插入重复记录（依赖数据库约束兜底）
- **当前缓解**：有 `@@unique([url, source])` 约束，但会导致插入失败而非跳过

**问题2：URL标准化导致的不同内容被误判为重复**
- **位置**：search.ts:322
- **场景**：`https://example.com` 和 `https://example.com/` 被视为相同
- **原因**：去重时标准化URL，去除尾部斜杠
- **影响**：可能错误跳过不同页面
- **当前缓解**：无

**问题3：大小写敏感导致的有效内容被误判为重复**
- **位置**：keywords.ts:49-72
- **场景**：`"AI"` 和 `"ai"` 被视为不同关键词
- **原因**：唯一约束大小写敏感
- **影响**：用户可能创建重复关键词
- **当前缓解**：无

#### 🟠 P1级漏判

**问题4：同内容不同URL被误判为不重复**
- **场景**：同一新闻在不同媒体发布
- **当前处理**：仅 `url + source` 唯一，`title` 重复不拦截
- **影响**：同一内容被采集多次
- **缓解措施**：实时软去重机制（删除旧记录）

**问题5：时间边界问题**
- **位置**：duplicateCleanup.ts:93-107
- **场景**：恰好24小时边界的数据
- **原因**：`createdAt >= timeThreshold`，可能遗漏边界数据
- **影响**：边界数据可能不被清理
- **当前缓解**：无

**问题6：删除后重新抓取的延迟**
- **位置**：hotspots.ts:308-321
- **场景**：用户删除某热点后想重新抓取
- **当前处理**：设置30天永久缓存
- **影响**：30天内无法重新抓取
- **用户感知**：删除后仍显示"已跳过"

### 5.2 误判风险分析

#### 🟠 P1级误判

**问题7：Redis缓存穿透导致数据库压力**
- **位置**：hotspotChecker.ts:70-86
- **场景**：Redis不可用时，每次都查询数据库
- **原因**：catch块中仍查询数据库
- **影响**：大量请求打到数据库
- **当前缓解**：数据库有唯一约束兜底

**问题8：AI分析结果不一致导致误判**
- **位置**：hotspotChecker.ts:296-311
- **场景**：同一内容两次AI分析，相关性评分不同
- **原因**：AI模型的不确定性
- **影响**：可能通过一次、失败一次
- **当前缓解**：有数据库约束兜底

**问题9：关键词扩展导致的内容偏移**
- **位置**：hotspotChecker.ts:212-215
- **场景**：AI扩展关键词后，返回与原关键词相关性低的内容
- **原因**：相关性阈值 < 65时，`keywordMentioned=false` 被过滤
- **影响**：可能漏掉有价值的内容
- **当前缓解**：相关性 >= 50 仍可通过

### 5.3 高并发场景问题

#### 🔴 P0级并发问题

**问题10：热点采集的并发竞态**
- **场景**：多个关键词同时抓取相同URL
- **根因**：查重和插入分离，存在时间窗口
- **当前缓解**：使用upsert，但有竞态窗口
- **建议**：使用数据库事务或乐观锁

**问题11：Redis缓存雪崩**
- **场景**：大量缓存同时过期
- **原因**：所有缓存使用相同的24小时过期时间
- **影响**：瞬间大量请求打到数据库
- **建议**：使用随机过期时间（如 `24*3600 + random(0, 3600)`）

**问题12：通知创建的并发重复**
- **场景**：同一热点同时满足多个通知条件
- **位置**：hotspotChecker.ts:384-391
- **根因**：`existingNotification` 检查和创建不是原子操作
- **影响**：可能创建重复通知
- **当前缓解**：无（Notification表无hotspotId唯一约束）

### 5.4 性能瓶颈分析

#### 🟡 P2级性能问题

**问题13：逐条查重的数据库查询过多**
- **位置**：hotspotChecker.ts:23-92
- **场景**：每个结果都查询Redis和数据库
- **影响**：如果有1000个关键词×20个结果 = 20000次查询
- **当前缓解**：Redis缓存减少数据库查询
- **优化方向**：批量预查询、使用连接池

**问题14：顺序处理关键词**
- **位置**：hotspotChecker.ts:198
- **场景**：关键词串行处理
- **影响**：处理速度受限于单个关键词时间
- **当前缓解**：数据源搜索是并行的（Promise.allSettled）
- **优化方向**：关键词批量并行处理（注意API限流）

**问题15：同步AI调用**
- **位置**：hotspotChecker.ts:293
- **场景**：每个结果同步调用AI分析
- **影响**：AI调用成为瓶颈
- **当前缓解**：有相关性阈值过滤，提前过滤低质量内容
- **优化方向**：批量AI分析、异步队列

**问题16：软去重清理的N+1问题**
- **位置**：duplicateCleanup.ts:113-130
- **场景**：找出重复记录后，逐个查询最老记录
- **影响**：大量查询
- **优化方向**：使用子查询或窗口函数

```typescript
// 当前：N+1查询
for (const dup of duplicates) {
  const oldest = await prisma.hotspot.findFirst({ orderBy: { createdAt: 'asc' } });
  await prisma.hotspot.deleteMany({ NOT: { id: oldest.id } });
}

// 优化：使用窗口函数
const duplicates = await prisma.$queryRaw`
  WITH Ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY title, source ORDER BY createdAt ASC) as rn
    FROM Hotspot
    WHERE createdAt >= ${timeThreshold}
  )
  SELECT id FROM Ranked WHERE rn > 1
`;
```

### 5.5 跨模块规则不一致问题

#### 🟠 P1级一致性问题

**问题17：去重依据不一致**
| 模块 | 去重依据 | 说明 |
|------|---------|------|
| hotspotChecker缓存 | `source + title` | 不考虑URL |
| hotspotChecker数据库 | `url + source` OR `title + source` | 双保险 |
| 搜索服务 | URL标准化 | 去除尾部斜杠和www |
| 软去重 | `title + source` | 保留最新 |

**不一致影响**：
- 搜索服务去重后，hotspotChecker可能因URL不同而接受
- 缓存和数据库去重依据不完全一致

**问题18：缓存过期时间不一致**
| 场景 | 缓存时间 | 说明 |
|------|---------|------|
| 采集去重缓存 | 24小时 | 普通去重 |
| 删除热点缓存 | 30天 | 永久过滤 |
| 清理旧数据缓存 | 30天 | 永久过滤 |

**不一致影响**：用户难以理解删除行为

**问题19：重要性保留策略不一致**
| 模块 | 策略 | 说明 |
|------|------|------|
| 旧数据清理 | 保留 high/urgent | 按importance字段 |
| AI分析 | 生成importance值 | low/medium/high/urgent |
| 通知清理 | 无差别清理 | 按创建时间 |

**问题20：type字段约束不一致**
| 操作 | 约束方式 | 说明 |
|------|---------|------|
| 创建来源 | 应用层校验 | 捕获P2002错误 |
| 更新来源 | 无校验 | 可能修改type |
| 导入来源 | 应用层校验 | 双重检查 |
| 数据库 | 无约束 | 依赖应用层 |

---

## 六、优化优先级排序与实施方案

### 6.1 问题优先级矩阵

#### 表6.1.1 问题优先级总览

| 优先级 | 问题ID | 问题名称 | 影响程度 | 修复难度 | 建议方案 |
|--------|--------|---------|---------|---------|---------|
| P0 | Q-10 | 热点采集的并发竞态 | 严重 | 中 | 添加事务或乐观锁 |
| P0 | Q-01 | 并发竞态条件下的重复插入 | 严重 | 中 | 添加事务或乐观锁 |
| P0 | Q-12 | 通知创建的并发重复 | 中等 | 低 | 添加hotspotId唯一约束 |
| P1 | Q-02 | URL标准化误判 | 中等 | 低 | 改进URL标准化逻辑 |
| P1 | Q-03 | 关键词大小写敏感 | 中等 | 低 | 规范化关键词输入 |
| P1 | Q-08 | AI分析结果不一致 | 中等 | 高 | 添加重试机制或批量分析 |
| P1 | Q-11 | Redis缓存雪崩 | 中等 | 低 | 添加随机过期时间 |
| P1 | Q-17 | 去重依据不一致 | 低 | 中 | 统一去重逻辑 |
| P1 | Q-19 | 重要性保留策略不一致 | 低 | 中 | 统一清理策略 |
| P2 | Q-04 | 同内容不同URL | 低 | 高 | 考虑内容指纹去重 |
| P2 | Q-05 | 时间边界问题 | 低 | 低 | 调整时间窗口 |
| P2 | Q-13 | 数据库查询过多 | 中等 | 中 | 批量预查询 |
| P2 | Q-14 | 顺序处理关键词 | 中等 | 中 | 并行处理 |
| P2 | Q-15 | 同步AI调用 | 中等 | 高 | 异步队列 |
| P2 | Q-16 | N+1查询问题 | 中等 | 低 | 使用窗口函数 |

### 6.2 分阶段实施方案

#### 阶段一：立即修复（P0级，1-2天）

**Q-10 & Q-01：并发竞态问题修复**

```typescript
// 方案1：使用事务 + 唯一约束
await prisma.$transaction(async (tx) => {
  // 1. 尝试插入
  const hotspot = await tx.hotspot.create({
    data: { /* ... */ }
  });
  
  // 2. 成功后清理重复
  await tx.hotspot.deleteMany({
    where: {
      title: hotspot.title,
      source: hotspot.source,
      NOT: { id: hotspot.id }
    }
  });
  
  return hotspot;
}, {
  isolationLevel: 'Serializable'  // 最高隔离级别
});

// 方案2：使用upsert（已实现，但需优化）
const result = await prisma.hotspot.upsert({
  where: { url_source: { url, source } },
  create: { /* ... */ },
  update: {}  // 不更新已有记录
});

if (!result) {
  // upsert返回null表示未创建（已被其他请求创建）
  console.log('Duplicate detected');
}
```

**Q-12：通知去重约束添加**

```prisma
model Notification {
  // ...
  hotspotId String?   @unique  // 一个热点最多一条通知
}
```

#### 阶段二：短期优化（P1级，3-5天）

**Q-11：Redis缓存雪崩预防**

```typescript
// 当前
const CACHE_EXPIRE_SECONDS = 24 * 60 * 60;

// 优化
const BASE_EXPIRE = 24 * 60 * 60;
const RANDOM_RANGE = 1 * 60 * 60;  // 1小时随机范围
const CACHE_EXPIRE_SECONDS = BASE_EXPIRE + Math.floor(Math.random() * RANDOM_RANGE);
```

**Q-03：关键词规范化**

```typescript
// 优化前
await prisma.keyword.create({
  data: { text: text.trim() }
});

// 优化后
await prisma.keyword.create({
  data: { text: text.trim().toLowerCase() }
});
```

**Q-17：统一去重依据**

```typescript
// 统一使用 url + source 作为主要去重依据
// title + source 作为软去重（删除旧记录）
const cacheKey = `${DEDUP_CACHE_PREFIX}${item.source}:${item.url}`;
const dbQuery = {
  url: item.url,
  source: item.source
};
```

#### 阶段三：中期优化（P2级，1-2周）

**Q-13：批量预查询优化**

```typescript
// 当前：逐条查询
for (const item of results) {
  const existing = await prisma.hotspot.findFirst({ where: { url: item.url } });
}

// 优化：批量预查询
const urls = results.map(r => r.url);
const existingHotspots = await prisma.hotspot.findMany({
  where: { url: { in: urls } },
  select: { url: true, source: true }
});

const existingSet = new Set(existingHotspots.map(h => `${h.url}:${h.source}`));
const uniqueResults = results.filter(r => !existingSet.has(`${r.url}:${r.source}`));
```

**Q-16：N+1查询优化**

```typescript
// 使用窗口函数优化软去重
async function cleanupSoftDuplicateHotspots(softDuplicateHours: number = 24) {
  const timeThreshold = new Date(Date.now() - softDuplicateHours * 60 * 60 * 1000);
  
  // 使用原生SQL窗口函数
  const toDelete = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH Ranked AS (
      SELECT 
        id,
        title,
        source,
        createdAt,
        ROW_NUMBER() OVER (PARTITION BY title, source ORDER BY createdAt DESC) as rn
      FROM Hotspot
      WHERE createdAt >= ${timeThreshold}
    )
    SELECT id FROM Ranked WHERE rn > 1
  `;
  
  if (toDelete.length > 0) {
    await prisma.hotspot.deleteMany({
      where: { id: { in: toDelete.map(d => d.id) } }
    });
  }
}
```

#### 阶段四：长期优化（持续改进）

**Q-04：内容指纹去重**

```typescript
// 方案：计算内容指纹
import crypto from 'crypto';

function generateContentFingerprint(title: string, content: string): string {
  const text = (title + content).toLowerCase().trim();
  return crypto.createHash('md5').update(text).digest('hex').substring(0, 16);
}

// 添加到schema
model Hotspot {
  fingerprint String?  @index
  // ...
}
```

**Q-15：异步AI分析队列**

```typescript
// 方案：使用Bull队列
import Queue from 'bull';

const aiAnalysisQueue = new Queue('ai-analysis', 'redis://localhost:6379');

async function processHotspot(item) {
  // 1. 先保存到数据库
  const hotspot = await prisma.hotspot.create({ data: { /* ... */ } });
  
  // 2. 加入AI分析队列
  await aiAnalysisQueue.add({
    hotspotId: hotspot.id,
    title: item.title,
    content: item.content
  });
}

// 队列处理器
aiAnalysisQueue.process(async (job) => {
  const { hotspotId, title, content } = job.data;
  const analysis = await analyzeContent(title + '\n' + content);
  
  await prisma.hotspot.update({
    where: { id: hotspotId },
    data: {
      isReal: analysis.isReal,
      relevance: analysis.relevance,
      importance: analysis.importance
    }
  });
});
```

---

## 七、规范化查重逻辑统一整改方案

### 7.1 去重策略标准化

#### 7.1.1 去重层级定义

| 层级 | 名称 | 去重依据 | 适用范围 | 处理方式 | 优先级 |
|------|------|---------|---------|---------|--------|
| L0 | 数据库硬约束 | 唯一索引 | 全局 | 阻止插入/捕获异常 | P0 |
| L1 | 应用层精确去重 | `url + source` | 热点采集 | 跳过 | P0 |
| L2 | 应用层模糊去重 | `title + source` | 热点采集 | 软删除旧记录 | P1 |
| L3 | 缓存层预去重 | `source + title` | 热点采集 | 跳过 | P1 |
| L4 | 业务逻辑去重 | `keyword + url` | 关键词去重 | 预警 | P2 |
| L5 | 定期清理去重 | `title + source` + 时间 | 全局 | 软删除 | P2 |

#### 7.1.2 统一去重流程

```
数据输入
    ↓
┌──────────────────────────────────┐
│  L3 缓存层预检查                  │
│  • Redis查询 source:title        │
│  • 命中 → 跳过                    │
│  • 未命中 → 继续                  │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│  L1 应用层精确检查                 │
│  • 数据库查询 url + source       │
│  • 存在 → 跳过                    │
│  • 不存在 → 继续                  │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│  L0 数据库约束兜底                 │
│  • 执行 upsert                   │
│  • 捕获 P2002 → 跳过              │
│  • 成功 → 继续                    │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│  L2 软去重清理                    │
│  • 查询 title + source 重复记录  │
│  • 删除旧记录，保留最新            │
└──────────────────────────────────┘
    ↓
数据持久化
```

### 7.2 缓存策略标准化

#### 7.2.1 缓存键命名规范

| 缓存类型 | 键格式 | 示例 | 过期时间 | 说明 |
|---------|--------|------|---------|------|
| 热点去重缓存 | `hotspot:dedup:{source}:{title}` | `hotspot:dedup:twitter:AI News` | 24h | 普通去重 |
| 删除热点缓存 | `hotspot:deleted:{source}:{title}` | `hotspot:deleted:twitter:AI News` | 30d | 永久过滤 |
| 来源配置缓存 | `source:config:{sourceId}` | `source:config:baidu` | 1h | 配置缓存 |
| 关键词缓存 | `keyword:active` | `keyword:active` | 5m | 活跃关键词 |

#### 7.2.2 缓存雪崩预防

```typescript
function getCacheWithJitter(baseTTL: number, jitterRange: number): number {
  return baseTTL + Math.floor(Math.random() * jitterRange);
}

// 使用示例
const HOTSPOT_DEDUP_TTL = getCacheWithJitter(24 * 3600, 3600);  // 24h ± 1h
const DELETE_CACHE_TTL = getCacheWithJitter(30 * 24 * 3600, 24 * 3600);  // 30d ± 1d
```

### 7.3 数据库约束标准化

#### 7.3.1 唯一约束清单

| 表名 | 字段组合 | 约束类型 | 说明 | 状态 |
|------|---------|---------|------|------|
| Keyword | `text` | 唯一约束 | 关键词唯一 | ✅ 已实现 |
| Source | `name` | 唯一约束 | 来源名称唯一 | ✅ 已实现 |
| Source | `type` | 唯一约束 | 来源类型唯一 | ⚠️  待评估 |
| Hotspot | `url, source` | 复合唯一 | 硬重复 | ✅ 已实现 |
| Hotspot | `title, source` | 复合唯一 | 软重复 | ✅ 已实现 |
| Notification | `hotspotId` | 唯一约束 | 一个热点一通知 | ❌ 待添加 |
| Setting | `key` | 唯一约束 | 配置键唯一 | ✅ 已实现 |

#### 7.3.2 索引优化建议

```prisma
model Keyword {
  // 优化：添加isActive索引
  @@index([isActive])
}

model Hotspot {
  // 优化：添加publishedAt索引（新鲜度过滤）
  @@index([publishedAt])
}

model Notification {
  // 优化：添加hotspotId唯一约束
  hotspotId String?   @unique
}
```

### 7.4 错误处理标准化

#### 7.4.1 错误码定义

```typescript
const DEDUPLICATION_ERROR_CODES = {
  // 来源相关
  SOURCE_NAME_DUPLICATE: { code: 'E1001', message: '来源名称已存在', httpStatus: 400 },
  SOURCE_TYPE_DUPLICATE: { code: 'E1002', message: '数据源类型已存在', httpStatus: 400 },
  IMPORT_TYPE_DUPLICATE: { code: 'E1003', message: '批量导入中存在重复type', httpStatus: 400 },
  
  // 热点相关
  HOTSPOT_URL_DUPLICATE: { code: 'E2001', message: '热点URL已存在', httpStatus: 409 },
  HOTSPOT_TITLE_DUPLICATE: { code: 'E2002', message: '热点标题已存在', httpStatus: 409 },
  
  // 关键词相关
  KEYWORD_DUPLICATE: { code: 'E3001', message: '关键词已存在', httpStatus: 409 },
  
  // 通知相关
  NOTIFICATION_DUPLICATE: { code: 'E4001', message: '通知已存在', httpStatus: 409 },
  
  // 系统相关
  CACHE_ERROR: { code: 'E5001', message: '缓存服务异常', httpStatus: 503 },
  DB_CONSTRAINT_VIOLATION: { code: 'E5002', message: '数据库约束冲突', httpStatus: 409 }
} as const;
```

#### 7.4.2 统一错误处理

```typescript
async function safeCreateHotspot(data: HotspotData) {
  try {
    return await prisma.hotspot.upsert({
      where: { url_source: { url: data.url, source: data.source } },
      create: data,
      update: {}
    });
  } catch (error) {
    if (error.code === 'P2002') {
      // 唯一约束冲突
      console.log('Duplicate detected by unique constraint');
      return null;
    }
    
    if (error.code === 'P2025') {
      // 记录不存在
      throw new Error(DEDUPLICATION_ERROR_CODES.HOTSPOT_URL_DUPLICATE.message);
    }
    
    // 其他错误
    console.error('Database error:', error);
    throw error;
  }
}
```

---

## 八、数据质量监控体系

### 8.1 监控指标定义

#### 表8.1.1 查重相关监控指标

| 指标名称 | 类型 | 计算方式 | 告警阈值 | 说明 |
|---------|------|---------|---------|------|
| `dedup.source.type.conflicts` | Counter | type冲突次数 | > 0 | 来源type重复 |
| `dedup.hotspot.url.conflicts` | Counter | URL冲突次数 | > 100/day | 热点URL重复 |
| `dedup.hotspot.title.conflicts` | Counter | 标题冲突次数 | > 1000/day | 热点标题重复 |
| `dedup.cache.hit_rate` | Gauge | 缓存命中率 | < 80% | 缓存效率 |
| `dedup.cache.error_rate` | Gauge | 缓存错误率 | > 1% | 缓存稳定性 |
| `dedup.cleanup.removed` | Counter | 清理数量 | - | 清理效果 |
| `dedup.notification.duplicates` | Counter | 通知重复次数 | > 10/day | 通知重复 |

### 8.2 数据质量报告

#### 8.2.1 每日数据质量检查

```typescript
async function dailyDataQualityCheck() {
  const report = {
    timestamp: new Date(),
    issues: []
  };
  
  // 1. 检查Source表type重复
  const sourceTypeDuplicates = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count
    FROM Source
    GROUP BY type
    HAVING COUNT(*) > 1
  `;
  
  if (sourceTypeDuplicates.length > 0) {
    report.issues.push({
      severity: 'critical',
      table: 'Source',
      issue: 'TYPE_DUPLICATE',
      count: sourceTypeDuplicates.length,
      details: sourceTypeDuplicates
    });
  }
  
  // 2. 检查Hotspot表软重复
  const hotspotSoftDuplicates = await prisma.$queryRaw`
    SELECT title, source, COUNT(*) as count
    FROM Hotspot
    WHERE createdAt > datetime('now', '-7 days')
    GROUP BY title, source
    HAVING COUNT(*) > 5
  `;
  
  if (hotspotSoftDuplicates.length > 0) {
    report.issues.push({
      severity: 'warning',
      table: 'Hotspot',
      issue: 'SOFT_DUPLICATE',
      count: hotspotSoftDuplicates.length,
      details: hotspotSoftDuplicates
    });
  }
  
  // 3. 检查Notification表hotspotId重复
  const notificationDuplicates = await prisma.$queryRaw`
    SELECT hotspotId, COUNT(*) as count
    FROM Notification
    WHERE hotspotId IS NOT NULL
    GROUP BY hotspotId
    HAVING COUNT(*) > 1
  `;
  
  if (notificationDuplicates.length > 0) {
    report.issues.push({
      severity: 'warning',
      table: 'Notification',
      issue: 'HOTSPOTID_DUPLICATE',
      count: notificationDuplicates.length,
      details: notificationDuplicates
    });
  }
  
  return report;
}
```

#### 8.2.2 监控告警配置

```yaml
# prometheus alerting rules
groups:
  - name: deduplication_alerts
    rules:
      - alert: HighSourceTypeConflicts
        expr: increase(dedup_source_type_conflicts[1h]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "来源type重复冲突"
          
      - alert: HighHotspotUrlConflicts
        expr: increase(dedup_hotspot_url_conflicts[1h]) > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "热点URL重复过多"
          
      - alert: LowCacheHitRate
        expr: dedup_cache_hit_rate < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "缓存命中率过低"
```

---

## 九、结论与建议

### 9.1 当前系统评价

#### 优点

1. **多层防护机制**：系统实现了Redis缓存 + 数据库查询 + 唯一约束的三层防护
2. **实时软去重**：成功解决了同标题内容的重复问题
3. **完善的索引配置**：主要查询场景都有对应的索引优化
4. **自动化清理**：定期清理任务保证了数据的持续健康

#### 不足

1. **并发控制薄弱**：查重和插入不是原子操作，存在竞态条件
2. **约束不完整**：Notification表缺少hotspotId唯一约束
3. **规则不一致**：不同模块的去重依据不完全一致
4. **性能瓶颈**：逐条查询导致大量数据库操作

### 9.2 改进建议

#### 短期（1-2周）

1. ✅ 添加Notification表hotspotId唯一约束
2. ✅ 修复Redis缓存雪崩问题（添加随机过期时间）
3. ✅ 统一去重依据为 `url + source`
4. ✅ 优化关键词输入规范化

#### 中期（1个月）

1. 使用数据库事务或乐观锁解决并发竞态
2. 实现批量预查询优化性能
3. 使用窗口函数优化N+1查询
4. 完善监控指标和告警

#### 长期（持续）

1. 考虑内容指纹去重（解决同内容不同URL问题）
2. 实现异步AI分析队列
3. 建立数据质量仪表板
4. 持续优化查询性能

### 9.3 风险评估

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 并发重复插入 | 数据质量下降 | 中 | 添加唯一约束 |
| 缓存雪崩 | 服务不可用 | 低 | 随机过期时间 |
| AI分析不一致 | 漏判/误判 | 中 | 添加重试机制 |
| 数据库性能瓶颈 | 响应变慢 | 高 | 批量查询优化 |

---

## 附录

### 附录A：相关文件清单

| 文件路径 | 说明 | 代码行数 |
|---------|------|---------|
| server/prisma/schema.prisma | 数据库Schema定义 | 116 |
| server/src/jobs/hotspotChecker.ts | 热点采集核心逻辑 | 430 |
| server/src/jobs/duplicateCleanup.ts | 重复数据清理 | 302 |
| server/src/routes/sources.ts | 来源管理API | 718 |
| server/src/routes/keywords.ts | 关键词管理API | 137 |
| server/src/routes/hotspots.ts | 热点管理API | 382 |
| server/src/services/search.ts | 搜索服务（含去重） | 352 |
| server/src/services/chinaSearch.ts | 国内搜索服务 | 625 |
| server/src/datasources/DataSourceManager.ts | 数据源管理器 | 305 |

### 附录B：错误码完整列表

| 错误码 | 错误名称 | HTTP状态 | 说明 |
|--------|---------|---------|------|
| E1001 | SOURCE_NAME_DUPLICATE | 400 | 来源名称已存在 |
| E1002 | SOURCE_TYPE_DUPLICATE | 400 | 数据源类型已存在 |
| E1003 | IMPORT_TYPE_DUPLICATE | 400 | 批量导入中存在重复type |
| E2001 | HOTSPOT_URL_DUPLICATE | 409 | 热点URL已存在 |
| E2002 | HOTSPOT_TITLE_DUPLICATE | 409 | 热点标题已存在 |
| E3001 | KEYWORD_DUPLICATE | 409 | 关键词已存在 |
| E4001 | NOTIFICATION_DUPLICATE | 409 | 通知已存在 |
| E5001 | CACHE_ERROR | 503 | 缓存服务异常 |
| E5002 | DB_CONSTRAINT_VIOLATION | 409 | 数据库约束冲突 |

### 附录C：配置常量表

| 常量名称 | 值 | 说明 |
|---------|---|------|
| MAX_AGE_HOURS | 168 (7×24) | 内容最大保留时间 |
| CACHE_EXPIRE_SECONDS | 86400 (24h) | 去重缓存过期时间 |
| DELETE_CACHE_SECONDS | 2592000 (30d) | 删除数据缓存过期时间 |
| SOFT_DUPLICATE_HOURS | 24 | 软去重时间窗口 |
| OLD_DATA_DAYS | 30 | 旧数据清理阈值 |
| TWITTER_QUOTA | 20 | Twitter处理配额 |
| OTHER_QUOTA | 15 | 其他来源配额 |
| MIN_RELEVANCE | 50 | 最低相关性阈值 |
| MIN_RELEVANCE_NO_KEYWORD | 65 | 无关键词提及时的最低相关性 |

---

**文档版本**：v1.0  
**创建日期**：2026-05-28  
**最后更新**：2026-05-28  
**维护者**：系统管理员  
**审核状态**：待审核
