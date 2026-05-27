# 信息流过滤规则全局梳理

## 一、过滤架构概览

信息流（热点数据）在系统中经过五层过滤处理：

```
┌─────────────────────────────────────────────┐
│  第一层：数据源层（爬虫层）                  │
│  └─ 基础验证、频率限制、URL格式检查         │
├─────────────────────────────────────────────┤
│  第二层：结果聚合层                          │
│  └─ 去重排序、新鲜度过滤、优先级排序       │
├─────────────────────────────────────────────┤
│  第三层：业务处理层                          │
│  └─ 配额限制、数据库查重、AI内容分析        │
├─────────────────────────────────────────────┤
│  第四层：持久化层                          │
│  └─ URL有效性验证、重要性评估               │
├─────────────────────────────────────────────┤
│  第五层：定期清理层                          │
│  └─ 软去重、旧数据清理、来源去重           │
└─────────────────────────────────────────────┘
```

---

## 二、第一层：数据源层

### 2.1 搜索服务过滤

**文件**：`server/src/services/search.ts`

#### Bing 搜索过滤

```typescript
// 基础验证规则
if (title && rawUrl && rawUrl.startsWith('http')) {
  results.push({...});
}
```

**过滤条件**：
- 标题必须存在且非空
- URL 必须存在且以 `http` 开头
- 使用 CSS 选择器 `li.b_algo` 提取结果

#### URL 解析与验证

```typescript
async function resolveSearchEngineUrls(results: SearchResult[]): Promise<SearchResult[]> {
  // 验证HTTP协议
  if (isValidHttpUrl(extractedUrl)) {
    resolvedResults.push({ ...result, url: extractedUrl });
  }
}
```

**过滤条件**：
- 提取重定向链接中的真实 URL
- 验证解码后的 URL 必须是有效的 HTTP/HTTPS URL
- 无效 URL 不添加到结果集

### 2.2 中国搜索服务

**文件**：`server/src/services/chinaSearch.ts`

#### 搜狗搜索过滤

```typescript
// 排除广告
if (title && url && !title.includes('大家还在搜')) {
  results.push({...});
}
```

**过滤条件**：
- 标题不能包含"大家还在搜"（广告标记）
- URL 必须存在

#### 微博热搜过滤

```typescript
const isMatch = queryWords.some(qw => 
  word.includes(qw) || qw.includes(word)
  || word.includes(queryLower)
  || queryLower.includes(word)
);
```

**过滤条件**：
- 查询词必须与热搜话题有交集
- 支持前缀匹配和包含匹配

### 2.3 频率限制

**文件**：`server/src/services/search.ts`

```typescript
class RateLimiter {
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
  }
}

// 各服务配置
const bingLimiter = new RateLimiter(5000);   // 5秒
const googleLimiter = new RateLimiter(10000); // 10秒
const ddgLimiter = new RateLimiter(3000);     // 3秒
```

**配置参数**：

| 数据源 | 请求间隔 | 说明 |
|--------|----------|------|
| Twitter | 15秒 | API 限制 |
| Bing | 5秒 | 反爬虫 |
| Google | 10秒 | 严格反爬虫 |
| DuckDuckGo | 3秒 | 宽松限制 |
| HackerNews | 1秒 | API 无限制 |

---

## 三、第二层：结果聚合层

### 3.1 结果去重

**文件**：`server/src/services/search.ts`

```typescript
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter(item => {
    const key = `${item.title}:${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

**去重规则**：
- 按 `title + source` 组合去重
- 保留首次出现的记录
- 后续重复的直接过滤

### 3.2 新鲜度过滤

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
const MAX_AGE_HOURS = 7 * 24; // 7天

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    if (!item.publishedAt) return true;  // 无时间暂时保留
    return item.publishedAt >= cutoff;
  });
}
```

**过滤规则**：
- 发布时间超过 7 天则丢弃
- 无发布时间的内容暂时保留
- 搜索引擎结果通常没有时间

### 3.3 来源优先级排序

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
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
```

**优先级顺序**（数字越小优先级越高）：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | Twitter | 社交媒体，实时性强 |
| 2 | 微博 | 国内社交媒体 |
| 3 | B站 | 视频平台 |
| 4 | 微信公众号 | 内容平台 |
| 5 | HackerNews | 技术社区 |
| 6-9 | 搜索引擎 | 搜索结果，质量较低 |

---

## 四、第三层：业务处理层

### 4.1 配额限制

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
const TWITTER_QUOTA = 20;
const OTHER_QUOTA = 15;

for (const item of sortedResults) {
  if (item.source === 'twitter' && twitterProcessed >= TWITTER_QUOTA) {
    skippedByQuota++;
    continue;
  }
  if (item.source !== 'twitter' && otherProcessed >= OTHER_QUOTA) {
    skippedByQuota++;
    continue;
  }
}
```

**配额配置**：

| 来源类别 | 配额 | 说明 |
|----------|------|------|
| Twitter | 20条 | 社交内容优先 |
| 其他来源 | 15条 | 总共最多处理 35 条 |

### 4.2 数据库查重

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
const existing = await prisma.hotspot.findFirst({
  where: {
    url: item.url,
    source: item.source
  }
});

if (existing) {
  console.log(`  ⏭️  Skipped (already exists): ${item.title}`);
  skippedCount++;
  continue;
}
```

**查重规则**：
- 按 `url + source` 组合查询
- 存在则跳过，不重复插入

### 4.3 AI 内容分析

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
const fullText = item.title + '\n' + item.content;
const analysis = await analyzeContent(fullText, keyword.text, preMatch);

// 过滤假新闻/垃圾内容
if (!analysis.isReal) {
  console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
  continue;
}
```

**AI 分析维度**：

| 分析项 | 字段 | 说明 |
|--------|------|------|
| 真实性 | isReal | 是否为真实内容（非假新闻/垃圾） |
| 相关性 | relevance | 与关键词的相关程度（0-100） |
| 重要性 | importance | 重要程度（low/medium/high/urgent） |
| 关键词提及 | keywordMentioned | 标题/内容是否提及关键词 |
| 相关原因 | relevanceReason | AI 生成的相关性解释 |

---

## 五、第四层：持久化层

### 5.1 URL 有效性验证

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
if (!item.url || !isValidHttpUrl(item.url)) {
  console.log(`  ⏭️  Skipped (invalid URL)`);
  continue;
}
```

**验证规则**：
- URL 必须存在
- 必须是有效的 HTTP/HTTPS URL
- 格式必须符合 URL 规范

### 5.2 相关性阈值过滤

**文件**：`server/src/jobs/hotspotChecker.ts`

```typescript
// 基本阈值：50 分以下过滤
if (analysis.relevance < 50) {
  console.log(`  ⏭ Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
  continue;
}

// 特殊规则：关键词未被提及且相关性不足 65
if (!analysis.keywordMentioned && analysis.relevance < 65) {
  console.log(`  ⏭ Keyword not mentioned & relevance < 65 (${analysis.relevance})`);
  continue;
}
```

**阈值规则**：

| 条件 | 阈值 | 说明 |
|------|------|------|
| 基本相关性 | ≥ 50 | 必须满足 |
| 关键词未提及 | ≥ 65 | 需更高相关性 |
| 关键词已提及 | ≥ 50 | 满足基本阈值即可 |

---

## 六、第五层：定期清理层

### 6.1 软去重（24小时）

**文件**：`server/src/jobs/duplicateCleanup.ts`

```typescript
async cleanupSoftDuplicateHotspots(softDuplicateHours: number = 24) {
  const timeThreshold = new Date(Date.now() - softDuplicateHours * 60 * 60 * 1000);
  
  // 24小时内同一 title + source 只保留最早的一条
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
- 时间窗口：24 小时
- 去重键：`title + source`
- 保留策略：保留 `createdAt` 最早的记录

### 6.2 旧数据清理（30天）

**文件**：`server/src/jobs/duplicateCleanup.ts`

```typescript
async cleanupOldHotspots(daysOld: number = 30) {
  await prisma.hotspot.deleteMany({
    where: {
      importance: { notIn: ['high', 'urgent'] },
      createdAt: { lt: cutoffDate }
    }
  });
}
```

**清理规则**：
- 时间阈值：30 天
- 保护对象：`high` 和 `urgent` 重要性的热点
- 清理对象：非重要的旧热点

### 6.3 来源去重

**文件**：`server/src/jobs/duplicateCleanup.ts`

```typescript
async cleanupDuplicateSources() {
  const duplicates = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count, MIN(id) as keep_id
    FROM Source
    GROUP BY type
    HAVING COUNT(*) > 1
  `;
  
  await prisma.source.deleteMany({
    where: { type: dup.type, NOT: { id: dup.keep_id } }
  });
}
```

**清理规则**：
- 去重键：`type`（来源类型）
- 保留策略：保留 `id` 最小的记录

### 6.4 定时任务配置

```typescript
startScheduledCleanup() {
  const cronExpression = '0 3 * * 0';  // 每周日凌晨 3 点
  nodeCron.schedule(cronExpression, async () => {
    await this.cleanupAll();
  });
}
```

**执行周期**：每周日凌晨 3:00

---

## 七、过滤规则汇总

### 7.1 按层级分类

| 层级 | 过滤规则 | 文件位置 |
|------|----------|----------|
| L1 数据源 | URL 必须以 http 开头 | search.ts |
| L1 数据源 | 排除广告结果 | chinaSearch.ts |
| L1 数据源 | 频率限制 | search.ts |
| L2 聚合 | 结果去重（title+source） | search.ts |
| L2 聚合 | 新鲜度过滤（7天） | hotspotChecker.ts |
| L2 聚合 | 来源优先级排序 | hotspotChecker.ts |
| L3 业务 | 配额限制 | hotspotChecker.ts |
| L3 业务 | 数据库查重（url+source） | hotspotChecker.ts |
| L3 业务 | AI 真实性分析 | hotspotChecker.ts |
| L4 持久 | URL 有效性验证 | hotspotChecker.ts |
| L4 持久 | 相关性阈值过滤 | hotspotChecker.ts |
| L5 清理 | 软去重（24h） | duplicateCleanup.ts |
| L5 清理 | 旧数据清理（30天） | duplicateCleanup.ts |
| L5 清理 | 来源去重 | duplicateCleanup.ts |

### 7.2 按字段分类

| 字段 | 过滤规则 | 层级 |
|------|----------|------|
| url | 必须存在 | L1, L4 |
| url | 必须以 http 开头 | L1 |
| url | 验证 HTTP 协议 | L4 |
| title | 必须存在 | L1 |
| title | 去重（软删除） | L5 |
| source | 优先级排序 | L2 |
| source | 配额限制 | L3 |
| source | 数据库查重 | L3 |
| publishedAt | 新鲜度过滤（7天） | L2 |
| relevance | 阈值过滤（≥50） | L4 |
| importance | 保留 high/urgent | L5 |
| isReal | 真实性验证 | L3 |

---

## 八、配置常量表

| 常量 | 值 | 说明 |
|------|------|------|
| MAX_AGE_HOURS | 7×24 = 168小时 | 内容最大保留时间 |
| TWITTER_QUOTA | 20 | Twitter 配额 |
| OTHER_QUOTA | 15 | 其他来源配额 |
| RELAVANCE_MIN | 50 | 最低相关性阈值 |
| RELAVANCE_NO_KEYWORD | 65 | 关键词未提及时的阈值 |
| softDuplicateHours | 24 | 软去重时间窗口 |
| daysOld | 30 | 旧数据清理阈值 |
| MIN_PAGE_SIZE | 1 | 最小分页大小 |
| MAX_PAGE_SIZE | 100 | 最大分页大小 |

---

## 九、数据流程示意

```
用户激活关键词
    ↓
┌─────────────────────────────────────────┐
│ 第0步：账号检测                          │
│ 检测关键词是否为平台账号（如@用户名）       │
│ 如检测到，获取该账号最新内容              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第1步：关键词扩展（AI）                  │
│ expandKeyword() 生成查询变体              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第2步：并行搜索7个数据源                 │
│ Twitter / Bing / HN / 搜狗 / B站 / 微博 / 微信 │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第3步：结果聚合                          │
│ 合并所有搜索结果                         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第4步：L2 处理                           │
│ ① 结果去重（title+source）             │
│ ② 新鲜度过滤（7天）                   │
│ ③ 来源优先级排序                       │
│ ④ 配额限制（Twitter:20, 其他:15）      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第5步：L3 处理                           │
│ ① 数据库查重（url+source）              │
│ ② AI 内容分析                         │
│    - 真实性验证（isReal）             │
│    - 相关性评分（relevance ≥ 50）      │
│    - 重要性评估（importance）         │
│ ③ 阈值过滤                            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第6步：持久化                            │
│ 写入数据库                              │
│ 创建通知记录                            │
│ WebSocket 推送                          │
│ 邮件通知（high/urgent）                │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 第7步：定期清理（每周日凌晨3点）         │
│ ① 软去重（24h内重复）                │
│ ② 旧数据清理（30天前非重要）          │
│ ③ 来源去重                             │
└─────────────────────────────────────────┘
```

---

## 十、待优化项

### 10.1 当前缺失的过滤

1. **标题最小长度验证**
   - 当前：未检查
   - 建议：过滤标题 < 5 个字符的内容

2. **域名级别配额限制**
   - 当前：未限制同一域名的内容数量
   - 建议：同一域名最多保留 3 条

3. **语言检测**
   - 当前：未进行语言识别
   - 建议：过滤与关键词语言不匹配的内容

4. **内容质量评分阈值**
   - 当前：仅依赖 AI 的 relevance 评分
   - 建议：结合多个维度计算综合质量分

5. **重复域名过滤**
   - 当前：仅按 title+source 去重
   - 建议：添加域名维度的去重

### 10.2 建议的优化

| 优化项 | 优先级 | 工作量 | 说明 |
|--------|--------|--------|------|
| 标题最小长度验证 | 高 | 低 | 添加 title.length >= 5 检查 |
| 域名配额限制 | 中 | 中 | 同一域名最多3条 |
| 语言检测 | 低 | 高 | 引入 cld3 库 |
| 综合质量评分 | 中 | 中 | 多维度加权评分 |
| 高频去重 | 中 | 低 | 按域名+标题去重 |

---

**文档更新时间**：2026年5月27日
