# 数据过滤逻辑全局梳理

## 一、过滤层级概览

数据在系统中经过以下过滤层级：

```
┌─────────────────────────────────────────────┐
│         L1: 数据源层（爬虫层）              │
│  - 搜索API返回 → 初步验证 → 结果筛选     │
├─────────────────────────────────────────────┤
│         L2: 热点检查器层                  │
│  - 去重 → 新鲜度过滤 → 来源优先级 → 配额  │
├─────────────────────────────────────────────┤
│         L3: 数据库持久化层                  │
│  - 唯一性检查 → 重要性评估 → 存储        │
├─────────────────────────────────────────────┤
│         L4: API查询层                      │
│  - 参数验证 → 时间范围 → 分页处理 → 排序  │
├─────────────────────────────────────────────┤
│         L5: 定期清理任务                    │
│  - 软去重 → 旧数据清理 → 来源去重         │
└─────────────────────────────────────────────┘
```

---

## 二、L1: 数据源层（爬虫层）

### 2.1 搜索服务过滤 (`search.ts`)

**文件位置**：`server/src/services/search.ts`

#### Bing 搜索过滤

```typescript
// 基础验证
if (title && rawUrl && rawUrl.startsWith('http')) {
  results.push({...});
}
```

**过滤规则**：
- `title` 必须存在且非空
- `rawUrl` 必须存在且以 `http` 开头
- 使用 `cheerio` 解析 HTML，提取 `li.b_algo` 选择器下的结果

#### URL 解析与验证

```typescript
async function resolveSearchEngineUrls(results: SearchResult[]): Promise<SearchResult[]> {
  // 验证是否为有效的 HTTP URL
  if (result.rawUrl.includes('bing.com/') && ...) {
    const extractedUrl = extractRealUrlFromBing(result.rawUrl);
    if (extractedUrl && isValidHttpUrl(extractedUrl)) {
      resolvedResults.push({ ...result, url: extractedUrl });
    }
  }
}
```

**过滤规则**：
- 提取重定向链接中的真实 URL
- 验证解码后的 URL 是否为有效的 HTTP/HTTPS URL
- 无效 URL 不添加到结果中

### 2.2 中国搜索服务 (`chinaSearch.ts`)

**文件位置**：`server/src/services/chinaSearch.ts`

#### 搜狗搜索过滤

```typescript
// 排除广告和无关结果
if (title && url && !title.includes('大家还在搜')) {
  results.push({...});
}
```

**过滤规则**：
- `title` 必须存在
- `url` 必须存在
- 排除标题包含"大家还在搜"的广告结果

#### 微博热搜过滤

```typescript
const isMatch = queryWords.some(qw => word.includes(qw) || qw.includes(word))
  || word.includes(queryLower)
  || queryLower.includes(word);
```

**过滤规则**：
- 查询词必须与热搜话题有交集
- 支持前缀匹配和包含匹配

### 2.3 频率限制 (`RateLimiter`)

```typescript
class RateLimiter {
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
  }
}

// 使用示例
const bingLimiter = new RateLimiter(5000);  // 5秒间隔
const googleLimiter = new RateLimiter(10000);  // 10秒间隔
```

**频率限制配置**：

| 服务 | 间隔 | 说明 |
|------|------|------|
| Bing | 5秒 | 中等限制 |
| Google | 10秒 | 严格限制 |
| DuckDuckGo | 3秒 | 宽松限制 |
| HackerNews | 1秒 | API更宽松 |

---

## 三、L2: 热点检查器层

**文件位置**：`server/src/jobs/hotspotChecker.ts`

### 3.1 新鲜度过滤

```typescript
const MAX_AGE_HOURS = 7 * 24; // 7天

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    if (!item.publishedAt) return true;  // 无发布时间暂时保留
    return item.publishedAt >= cutoff;
  });
}
```

**过滤规则**：
- 内容超过 7 天则丢弃
- 无发布时间的内容暂时保留（搜索引擎结果通常没有时间）

### 3.2 来源优先级排序

```typescript
function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    twitter: 1,
    weibo: 2,
    bilibili: 3,
    weixin: 4,
    hackernews: 5,
    sogou: 6,
    bing: 7,
    google: 8,
    duckduckgo: 9
  };
  return [...results].sort((a, b) => 
    (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99)
  );
}
```

**优先级顺序**（数字越小优先级越高）：
1. Twitter
2. 微博
3. B站
4. 微信公众号
5. HackerNews
6. 搜狗
7. 必应
8. Google
9. DuckDuckGo

### 3.3 配额限制

```typescript
const TWITTER_QUOTA = 20;
const OTHER_QUOTA = 15;

for (const item of sortedResults) {
  if (item.source === 'twitter' && twitterProcessed >= TWITTER_QUOTA) continue;
  if (item.source !== 'twitter' && otherProcessed >= OTHER_QUOTA) continue;
  // 处理结果...
}
```

**配额配置**：
- Twitter 最多处理 20 条
- 其他来源共享 15 条配额
- 总计最多 35 条

---

## 四、L3: 数据库持久化层

**文件位置**：`server/src/jobs/hotspotChecker.ts`

### 4.1 数据库唯一性检查

```typescript
const existing = await prisma.hotspot.findFirst({
  where: {
    title: item.title,
    source: item.source
  }
});

if (existing) {
  console.log(`  ⏭️  Skipped (already exists): ${item.title}`);
  skippedCount++;
  continue;
}
```

**过滤规则**：
- 检查 `title` + `source` 组合是否已存在
- 存在则跳过，不重复插入

### 4.2 URL 有效性过滤

```typescript
// 验证 URL 格式
if (!item.url || !isValidHttpUrl(item.url)) {
  console.log(`  ⏭️  Skipped (invalid URL)`);
  continue;
}

// 过滤搜索引擎重定向链接（短期会失效）
if (isSearchEngineRedirect(item.url)) {
  console.log(`  ⏭️  Skipped (search engine redirect URL)`);
  skippedCount++;
  continue;
}
```

**过滤规则**：
- URL 必须存在
- URL 必须是有效的 HTTP/HTTPS URL
- 排除搜索引擎重定向链接

### 4.3 重要性评估

```typescript
const importance = await analyzeContent(item.title, item.content || item.title);
```

**评估维度**：
- 标题关键词匹配（"突发"、"重磅"等）
- 内容分析（由 AI 服务提供）

---

## 五、L4: API 查询层

**文件位置**：`server/src/routes/hotspots.ts`

### 5.1 分页参数验证

```typescript
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;
```

**验证规则**：
- 页码最小值为 1
- 每页数量范围 1-100

### 5.2 时间范围过滤

```typescript
switch (timeRange) {
  case '1h':
    dateFrom = new Date(now.getTime() - 60 * 60 * 1000);
    break;
  case 'today':
    dateFrom.setHours(0, 0, 0, 0);
    break;
  case '7d':
    dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    break;
  case '30d':
    dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    break;
}
```

**时间范围选项**：
- `1h`：最近 1 小时
- `today`：今天
- `7d`：最近 7 天
- `30d`：最近 30 天

### 5.3 重要性过滤

```typescript
const importanceOptions = ['low', 'medium', 'high', 'urgent'];
if (importance && importanceOptions.includes(importance as string)) {
  where.importance = importance;
}
```

---

## 六、L5: 定期清理任务

**文件位置**：`server/src/jobs/duplicateCleanup.ts`

### 6.1 软去重（Soft Duplicate Cleanup）

```typescript
async cleanupSoftDuplicateHotspots(softDuplicateHours: number = 24): Promise<CleanupResult> {
  // 24小时内，同一 title + source 只保留最早的一条
  const timeThreshold = new Date(Date.now() - softDuplicateHours * 60 * 60 * 1000);
  
  // 删除重复记录，保留最早的
  await prisma.hotspot.deleteMany({
    where: {
      title: dup.title,
      source: dup.source,
      NOT: { id: oldest.id }  // 保留 oldest
    }
  });
}
```

**清理规则**：
- 24 小时内同一 `title` + `source` 只保留最早的一条
- 按 `createdAt` 升序排序，保留第一条
- 删除其余重复记录

### 6.2 旧数据清理

```typescript
async cleanupOldHotspots(daysOld: number = 30): Promise<CleanupResult> {
  await prisma.hotspot.deleteMany({
    where: {
      importance: { notIn: ['high', 'urgent'] },  // 保留重要内容
      createdAt: { lt: cutoffDate }
    }
  });
}
```

**清理规则**：
- 保留 30 天内的 `high` 和 `urgent` 热点
- 清理 30 天前的非重要热点
- 定期执行（每周日凌晨 3 点）

### 6.3 来源去重

```typescript
async cleanupDuplicateSources(): Promise<CleanupResult> {
  const duplicates = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count, MIN(id) as keep_id
    FROM Source
    GROUP BY type
    HAVING COUNT(*) > 1
  `;
  
  // 删除重复来源，保留最早的
  await prisma.source.deleteMany({
    where: { type: dup.type, NOT: { id: dup.keep_id } }
  });
}
```

**清理规则**：
- 同一 `type` 只保留一条记录
- 保留 `id` 最小的记录
- 删除其余重复记录

---

## 七、过滤规则汇总表

### 7.1 按阶段分类

| 阶段 | 过滤规则 | 文件位置 |
|------|----------|----------|
| L1 爬虫层 | URL 必须以 http 开头 | search.ts |
| L1 爬虫层 | 排除广告结果 | chinaSearch.ts |
| L1 爬虫层 | 频率限制 | search.ts |
| L2 检查器 | 7天内新鲜度 | hotspotChecker.ts |
| L2 检查器 | 来源优先级排序 | hotspotChecker.ts |
| L2 检查器 | 配额限制 | hotspotChecker.ts |
| L3 持久化 | title+source 唯一性 | hotspotChecker.ts |
| L3 持久化 | URL 有效性 | hotspotChecker.ts |
| L4 API | 分页参数验证 | hotspots.ts |
| L4 API | 时间范围过滤 | hotspots.ts |
| L4 API | 重要性过滤 | hotspots.ts |
| L5 清理 | 24h 软去重 | duplicateCleanup.ts |
| L5 清理 | 30天旧数据清理 | duplicateCleanup.ts |
| L5 清理 | 来源去重 | duplicateCleanup.ts |

### 7.2 按字段分类

| 字段 | 过滤规则 | 位置 |
|------|----------|------|
| url | 必须存在 | L1 |
| url | 必须以 http 开头 | L1 |
| url | 验证 HTTP 协议 | L3 |
| url | 排除搜索引擎重定向 | L3 |
| title | 必须存在 | L1, L3 |
| title | 去重（软删除） | L5 |
| source | 优先级排序 | L2 |
| source | 配额限制 | L2 |
| publishedAt | 7天内新鲜度 | L2 |
| importance | 保留 high/urgent | L5 |
| createdAt | 时间范围过滤 | L4 |

---

## 八、配置常量表

| 常量 | 值 | 说明 |
|------|------|------|
| MAX_AGE_HOURS | 7*24 | 内容最大保留时间 |
| TWITTER_QUOTA | 20 | Twitter 配额 |
| OTHER_QUOTA | 15 | 其他来源配额 |
| softDuplicateHours | 24 | 软去重时间窗口 |
| daysOld | 30 | 旧数据清理阈值 |
| MIN_PAGE_SIZE | 1 | 最小分页大小 |
| MAX_PAGE_SIZE | 100 | 最大分页大小 |
| bingLimiter | 5s | 必应请求间隔 |
| googleLimiter | 10s | Google 请求间隔 |

---

## 九、待优化项

### 9.1 缺失的过滤

1. **内容长度过滤**：标题过短（如单字词）的内容未过滤
2. **重复域名过滤**：同一域名的内容过多时未限制
3. **语言检测**：未进行语言识别，中文关键词可能匹配到英文内容
4. **内容质量评分**：缺乏基于内容的质量评估机制

### 9.2 建议的优化

1. 添加标题最小长度验证（如 5 个字符）
2. 添加域名级别的配额限制
3. 引入语言检测库（如 `cld3`）
4. 添加基于内容的质量评分阈值
5. 搜索引擎 URL 过滤更严格（当前只是标记）

---

## 十、数据流示意

```
用户搜索关键词
    ↓
激活关键词列表
    ↓
┌─────────────────────────────────────────┐
│ 并行搜索7个数据源                         │
│ Twitter / Bing / HackerNews / 搜狗 / B站 / 微博 / 微信 │
└─────────────────────────────────────────┘
    ↓
聚合所有结果
    ↓
┌─────────────────────────────────────────┐
│ L2 处理                                │
│ 1. 标题去重                           │
│ 2. 新鲜度过滤（7天）                   │
│ 3. 来源优先级排序                       │
│ 4. 配额限制（Twitter:20, 其他:15）    │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ L3 持久化检查                          │
│ 1. 数据库去重（title+source）           │
│ 2. URL有效性检查                       │
│ 3. 搜索引擎URL标记                     │
│ 4. AI重要性评估                        │
└─────────────────────────────────────────┘
    ↓
写入数据库
    ↓
发送通知（如有必要）
    ↓
┌─────────────────────────────────────────┐
│ L5 定期清理（每周日凌晨3点）            │
│ 1. 软去重（24h内重复）               │
│ 2. 旧数据清理（30天前非重要）         │
│ 3. 来源去重                           │
└─────────────────────────────────────────┘
```

---

**文档生成时间**：2026-05-27
